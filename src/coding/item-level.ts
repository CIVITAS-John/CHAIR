/**
 * Item-level conversation analysis base classes and utilities.
 *
 * This file provides the foundation for item-level coding strategies where each
 * message (item) in a conversation is analyzed and coded individually. The analyzer
 * processes conversations in chunks, assigning codes to each message based on LLM
 * interpretation.
 *
 * Key features:
 * - Adaptive chunk sizing based on model capabilities and retry attempts
 * - Context window management with prefetch for continuity
 * - Robust LLM response parsing with extensive format normalization
 * - Support for special message types (images, emojis, check-ins)
 * - Extraction of analysis metadata (thoughts, summary, notes)
 * - Comprehensive error handling and validation
 *
 * The parseResponse method is particularly complex, handling dozens of different
 * LLM output formats and edge cases to ensure reliable code extraction.
 *
 * @author John Chen
 */

import type { CodedThread, Message } from "../schema.js";
import { BaseStep } from "../steps/base-step.js";

import { buildMessagePrompt, ConversationAnalyzer } from "./conversations.js";

/**
 * Abstract base class for item-level coding analyzers.
 *
 * Item-level coding analyzes each message independently, assigning one or more codes
 * to describe the message's content, intent, or function. This approach is granular
 * and provides detailed coding at the message level.
 *
 * Processing strategy:
 * - Conversations are processed in chunks to fit within LLM context windows
 * - Each chunk includes prefetch messages for context continuity
 * - Chunk sizes adapt based on model capabilities and retry attempts
 * - LLM returns codes for each message along with analysis metadata
 *
 * Subclasses must implement:
 * - buildPrompts(): Create system and user prompts for the LLM
 * - name: Unique identifier for the analyzer
 *
 * @author John Chen
 */
export abstract class ItemLevelAnalyzerBase extends ConversationAnalyzer {
    /**
     * Term used in prompts to refer to a single code/tag (e.g., "tag", "code", "label", "phrase").
     * Subclasses can override to customize prompt terminology.
     */
    protected tagName = "tag";

    /**
     * Plural form of tagName used in prompts (e.g., "tags", "codes", "labels", "phrases").
     * Subclasses can override to customize prompt terminology.
     */
    protected tagsName = "tags";

    /**
     * Determine chunk size and context window parameters for LLM processing.
     *
     * This method implements an adaptive chunking strategy that:
     * 1. Reduces chunk size on retries to improve success rate
     * 2. Includes prefetch context from previous chunks for continuity
     * 3. Handles different strategies for weak vs. strong models
     *
     * Chunking strategy:
     * - Strong models: Start with recommended size, reduce by 2 per retry, add prefetch context
     * - Weak models (maxItems limit): Start at maxItems, reduce by 8 per retry, minimal prefetch
     *
     * @param recommended - Recommended chunk size based on model context window
     * @param _remaining - Number of remaining messages (unused in base implementation)
     * @param _iteration - Current iteration number (unused in base implementation)
     * @param tries - Number of retry attempts for this chunk (0 = first attempt)
     * @returns Tuple of [chunkSize, prefetchCount, postfetchCount]
     *          - chunkSize: Number of new messages to process
     *          - prefetchCount: Number of previous messages to include for context
     *          - postfetchCount: Number of future messages to include (always 0 here)
     */
    override getChunkSize(
        recommended: number,
        _remaining: number,
        _iteration: number,
        tries: number,
    ): [number, number, number] {
        const { session } = BaseStep.Context.get();
        if (!session) {
            throw new BaseStep.ContextVarNotFoundError("session");
        }

        // Weak model strategy: Aggressive size reduction on retries
        // Example: 32 => 24 => 16 => 8 messages per chunk
        if (recommended === (session.config.batchSize ?? 32)) {
            return [recommended - tries * 8, 0, 0];
        }

        // Strong model strategy: Gradual reduction with prefetch context
        // Example: 20 => 18 => 16 messages, with prefetch capped at 8
        return [recommended - tries * 2, Math.max(8 - recommended - tries, 0), 0];
    }

    /**
     * Build context message block for prompt inclusion.
     *
     * Creates a formatted context section showing previous messages without numbering.
     * These messages are for reference only and should not be coded by the LLM.
     *
     * @param messages - Full messages array including context and coding messages
     * @param chunkStart - Index where actual coding begins
     * @returns Formatted context string, or empty if no context
     */
    protected buildContextBlock(messages: Message[], chunkStart: number): string {
        const { dataset } = BaseStep.Context.get();

        // Determine context window range
        const contextStart = this.contextWindow === -1
            ? 0
            : Math.max(0, chunkStart - this.contextWindow);
        const contextEnd = chunkStart;

        // No context if window is 0 or chunkStart is 0
        if (this.contextWindow === 0 || chunkStart === 0 || contextStart >= contextEnd) {
            return "";
        }

        const contextMessages = messages.slice(contextStart, contextEnd);
        const contextLines = contextMessages.map(msg =>
            buildMessagePrompt(dataset, msg, undefined, this.tagsName)
        );

        return `\n=== Previous Conversation (for context only) ===\n${contextLines.join('\n')}\n${'='.repeat(50)}\n`;
    }

    /**
     * Parse LLM response and extract codes for each message.
     *
     * This is one of the most complex methods in the system, handling numerous
     * LLM output format variations and edge cases. The method performs:
     *
     * 1. **Metadata extraction**: Extracts Thoughts, Summary, and Notes sections
     * 2. **Code extraction**: Parses numbered message entries (e.g., "1. code here")
     * 3. **Format normalization**: Cleans various LLM formatting patterns
     * 4. **Special case handling**: Applies overrides for [Image], [Emoji], [Checkin]
     * 5. **Validation**: Ensures all required fields and messages are present
     *
     * Response format expected:
     * ```
     * Thoughts: {planning and analysis approach}
     * 1. {codes for message 1}
     * 2. {codes for message 2}
     * ...
     * Summary: {conversation summary}
     * Notes: {reflections and hypotheses}
     * ```
     *
     * Normalization handles:
     * - Bold markdown (**text**)
     * - Parenthetical notes (text (note))
     * - Tag prefixes (tag1:, code:, label:)
     * - Curly braces {text}
     * - List markers (-, *)
     * - CamelCase to spaces
     * - Underscores and hyphens to spaces
     * - Speaker name prefixes
     * - Explanatory text after colons
     *
     * @param analysis - The CodedThread being populated with codes and metadata
     * @param lines - Response text split into lines
     * @param messages - Array of messages being coded
     * @returns Promise resolving to map of 1-based message indices to code strings
     * @throws InvalidResponseError if response is malformed or incomplete
     */
    override parseResponse(
        analysis: CodedThread,
        lines: string[],
        messages: Message[],
        chunkStart: number,
        _iteration?: number,
    ): Promise<Record<number, string>> {
        const { dataset } = BaseStep.Context.get();
        const results: Record<number, string> = {};

        // Callback for handling multi-line metadata sections
        // When a section header has no immediate content, subsequent lines are appended
        let nextMessage: ((content: string) => void) | undefined;

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            const nextLine = i + 1 < lines.length ? lines[i + 1] : "";

            // Clean up common formatting artifacts
            line = line.replaceAll(/\*\*(.*?)\*\*/g, "$1"); // Remove **bold** markdown
            line = line.replace(/^#+ /, ""); // Remove markdown headers

            // === METADATA EXTRACTION ===
            // Extract analyst thoughts, summary, and reflections from structured sections

            if (line.startsWith("Thoughts:")) {
                // Extract planning and analytical approach
                analysis.plan = line.substring(9).trim();
                if (analysis.plan === "") {
                    // Multi-line content: set up callback to accumulate subsequent lines
                    nextMessage = (Content) => (analysis.plan = `${analysis.plan}${Content}\n`);
                } else {
                    nextMessage = undefined;
                }
            } else if (line.startsWith("Summary:")) {
                // Extract conversation summary
                analysis.summary = line.substring(8).trim();
                if (analysis.summary === "") {
                    nextMessage = (Content) =>
                        (analysis.summary = `${analysis.summary}${Content}\n`);
                } else {
                    nextMessage = undefined;
                }
            } else if (line.startsWith("Notes:")) {
                // Extract analyst reflections and hypotheses
                analysis.reflection = line.substring(6).trim();
                if (analysis.reflection === "") {
                    nextMessage = (Content) =>
                        (analysis.reflection = `${analysis.reflection}${Content}\n`);
                } else {
                    nextMessage = undefined;
                }
            } else {
                // === CODE EXTRACTION ===
                // Parse numbered message entries (e.g., "1. code here" or "1.\ncode here")

                const match = /^(\d+)\. (.*)$/.exec(line);
                if (match) {
                    const index = parseInt(match[1]) - 1; // Convert to 0-based index

                    // Validate index is within bounds
                    if (index < 0 || index >= messages.length) {
                        continue;
                    }

                    const message = messages[index];
                    let codes = match[2].trim();

                    // Handle multi-line format where code appears on next line
                    // Example: "1.\n    Greeting; Acknowledgment"
                    if (
                        nextLine !== "" &&
                        !nextLine.startsWith("Summary:") &&
                        !/^\d+\. .*$/.exec(nextLine)
                    ) {
                        codes = nextLine.trim();
                        i++; // Skip the next line since we consumed it
                    }

                    // === SPECIAL CASE OVERRIDES ===
                    // Apply hard-coded codes for special message types to ensure consistency

                    if (message.content === "[Image]") {
                        codes = "Image Sharing";
                    }
                    if (message.content === "[Emoji]") {
                        codes = "Emoji";
                    }
                    if (message.content === "[Checkin]") {
                        codes = "Checkin";
                    }

                    // === CODE NORMALIZATION ===
                    // Clean and standardize codes through extensive pattern matching
                    // This handles the many ways LLMs format their outputs

                    codes = codes.replaceAll(/\(.*?\)/g, "").trim(); // (explanatory note) -> ""
                    codes = codes.replaceAll(/\*(.*?)\*/g, "$1").trim(); // *emphasis* -> emphasis
                    codes = codes.replace(new RegExp(`^${this.tagName}(\\d+):`), "").trim(); // tag1: -> ""
                    codes = codes.replaceAll(/\{(.*?)\}/g, "$1").trim(); // {code} -> code

                    // Remove message content if LLM echoed it back
                    // Example: "Hello there Greeting" -> "Greeting"
                    if (codes.toLowerCase().startsWith(message.content.toLowerCase())) {
                        codes = codes.substring(message.content.length).trim();
                    }

                    // Remove various list and tag prefixes
                    if (codes.startsWith(`- ${this.tagsName}:`)) {
                        codes = codes.substring(7).trim(); // "- tags:" -> ""
                    }
                    if (codes.startsWith("-")) {
                        codes = codes.substring(1).trim(); // "- code" -> "code"
                    }
                    if (codes.endsWith(".")) {
                        codes = codes.substring(0, codes.length - 1).trim(); // "code." -> "code"
                    }
                    if (codes.toLowerCase().startsWith(`preliminary ${this.tagsName}:`)) {
                        codes = codes.substring(17).trim(); // "preliminary tags:" -> ""
                    }

                    // Convert CamelCase to space-separated words
                    // Example: "AcknowledgingResponse" -> "Acknowledging Response"
                    codes = codes.replace(/((?<=[a-z][a-z])[A-Z]|[A-Z](?=[a-z]))/g, " $1").trim();

                    // Normalize all word separators to spaces
                    codes = codes.replaceAll("-", " ");  // hyphen-case -> space case
                    codes = codes.replaceAll("_", " ");  // snake_case -> space case
                    codes = codes.replaceAll(/\s+/g, " "); // Collapse multiple spaces

                    // Remove speaker name prefix if LLM included it
                    // Example: "User-123: code" -> "code"
                    let speaker = dataset.getSpeakerName(message.uid).toLowerCase();
                    if (speaker.includes("-")) {
                        speaker = speaker.substring(0, speaker.indexOf("-")).trim();
                    }
                    codes = codes.replace(new RegExp(`^${speaker} *\\d*(;|:|$)`, "i"), "").trim();

                    // Remove explanatory text after colon
                    // Example: "Greeting: Saying hello" -> "Greeting"
                    if (/^[\w ]+: /.exec(codes)) {
                        codes = codes.substring(0, codes.indexOf(":")).trim();
                    }

                    // Store the cleaned code (1-based indexing)
                    results[parseInt(match[1])] = codes;
                    nextMessage = undefined;
                } else if (line !== "" && nextMessage) {
                    // Append content to multi-line metadata section
                    nextMessage(line);
                }
            }
        }

        // === VALIDATION ===
        // Ensure response completeness and correctness

        if (Object.values(results).every((Value) => Value === "")) {
            throw new ItemLevelAnalyzerBase.InvalidResponseError("All codes are empty");
        }
        if (analysis.plan === undefined) {
            throw new ItemLevelAnalyzerBase.InvalidResponseError("The response has no plans");
        }
        if (analysis.reflection === undefined) {
            throw new ItemLevelAnalyzerBase.InvalidResponseError("The response has no reflections");
        }
        if (analysis.summary === undefined) {
            throw new ItemLevelAnalyzerBase.InvalidResponseError("The response has no summary");
        }
        const expectedCount = messages.length - chunkStart;
        if (Object.keys(results).length !== expectedCount) {
            throw new ItemLevelAnalyzerBase.InvalidResponseError(
                `${Object.keys(results).length} results for ${expectedCount} messages (${messages.length} total, ${chunkStart} context)`,
            );
        }

        // Optional: Verify all message indices are sequentially present
        // This stricter check is disabled but can be enabled if needed
        // for (let i = 0; i < Object.keys(results).length; i++)
        //     if (!results[i + 1]) throw new Error(`missing message ${i + 1}`);

        return Promise.resolve(results);
    }
}
