/**
 * Item-level deductive coding base class.
 *
 * This analyzer applies predefined codes from a codebook to conversation messages.
 * Unlike inductive coding (which generates codes), deductive coding selects from
 * a fixed set of codes with known definitions.
 *
 * Key characteristics:
 * - Uses codebook from incoming CodedThread (analysis.codes)
 * - LLM selects appropriate codes from the codebook for each message
 * - Codebook must be pre-populated in analysis.codes before analysis begins
 * - Examples are collected during coding but definitions come from codebook
 *
 * Deductive vs Inductive:
 * - Inductive: LLM generates new codes → "Greeting", "Question", etc.
 * - Deductive: LLM selects from codebook → only codes with predefined definitions
 *
 * Use cases:
 * - Theory-driven analysis with established coding schemes
 * - Applying existing frameworks to new data
 * - Ensuring consistency across multiple datasets
 * - Validating or testing theoretical constructs
 *
 * @author John Chen
 */

import { search } from "fast-fuzzy";
import type { Codebook, CodedThread, Conversation, Message } from "../../schema.js";
import type { AIParameters } from "../../steps/base-step.js";
import { BaseStep } from "../../steps/base-step.js";
import { logger } from "../../utils/core/logger.js";
import { ConversationAnalyzer } from "../conversations.js";
import { buildMessagePrompt } from "../conversations.js";

/**
 * Abstract base class for item-level deductive coding analyzers.
 *
 * Extends ConversationAnalyzer to support deductive coding with predefined codebooks.
 * The main difference from inductive coding is in prompt construction: instead of asking
 * the LLM to generate codes, we provide a fixed list and ask it to select appropriate ones.
 *
 * The codebook is expected to be pre-populated in the incoming CodedThread's analysis.codes
 * property before the analyzer runs. This allows the analyzer to use the codebook from
 * the coded threads rather than receiving it as a constructor parameter.
 *
 * Subclasses must implement:
 * - buildPrompts(): Create prompts that include the codebook and instruct selection
 *
 * @author John Chen
 */
export abstract class ItemLevelCoderBase extends ConversationAnalyzer {
    /** Term used in prompts to refer to a single code */
    protected tagName = "code";
    /** Term used in prompts to refer to multiple codes */
    protected tagsName = "codes";

    /**
     * Create a new deductive coder.
     *
     * @param options - Optional configuration (name, prompt)
     */
    constructor(options?: { name?: string; prompt?: string }) {
        super(options);
    }

    /**
     * Determine chunk size and context window parameters for LLM processing.
     *
     * Default implementation returns the recommended chunk size without context.
     * Subclasses should override to implement prefetch/postfetch strategy.
     *
     * @param recommended - Recommended chunk size based on model context window
     * @param _remaining - Number of remaining messages
     * @param _iteration - Current iteration number
     * @param _tries - Number of retry attempts for this chunk
     * @returns Tuple of [chunkSize, prefetchCount, postfetchCount]
     */
    override getChunkSize(
        recommended: number,
        _remaining: number,
        _iteration: number,
        _tries: number,
    ): number | [number, number, number] {
        return [recommended, 0, 0];
    }

    /**
     * Helper method to format codebook for inclusion in prompts.
     *
     * Converts the codebook into a readable format for the LLM:
     * - Lists each code with its definition
     * - Uses consistent formatting for clarity
     * - Suitable for insertion into system or user prompts
     *
     * Example output:
     * ```
     * - greeting: A message expressing welcome or acknowledgment
     * - question: A message requesting information or clarification
     * - agreement: A message expressing concurrence or approval
     * ```
     *
     * @param codebook - The codebook to format
     * @returns Formatted string for prompt inclusion
     */
    protected formatCodebookForPrompt(codebook: Codebook): string {
        return Object.entries(codebook)
            .filter(([label, code]) => (code.definitions?.length ?? 0) > 0)
            .map(([label, code]) => {
                const parts = [`## ${label}`];

                const definition = code.definitions?.[0];
                if (definition) {
                    parts.push(`- Definition: ${definition}`);
                }

                if (code.categories && code.categories.length > 0) {
                    parts.push(`- Belongs to: ${code.categories.join(" => ")}`);
                }

                return parts.join("\n");
            })
            .join("\n\n");
    }

    /**
     * Build context message block for prompt inclusion.
     *
     * Creates a formatted context section showing previous messages without numbering.
     * These messages are for reference only and should not be coded by the LLM.
     * Does NOT include codes to avoid biasing the deductive coding process.
     *
     * @param messages - Full messages array including context and coding messages
     * @param chunkStart - Index where actual coding begins
     * @returns Formatted context string, or empty if no context
     */
    protected buildContextBlock(messages: Message[], chunkStart: number, aiParams?: AIParameters): string {
        const { dataset } = BaseStep.Context.get();

        // Use contextWindow from aiParams if provided, otherwise use analyzer's setting
        const contextWindow = aiParams?.contextWindow ?? this.contextWindow;

        // Determine context window range
        const contextStart = contextWindow === -1
            ? 0
            : Math.max(0, chunkStart - contextWindow);
        const contextEnd = chunkStart;

        // No context if window is 0 or chunkStart is 0
        if (contextWindow === 0 || chunkStart === 0 || contextStart >= contextEnd) {
            return "";
        }

        const contextMessages = messages.slice(contextStart, contextEnd);
        const contextLines = contextMessages.map(msg =>
            buildMessagePrompt(dataset, msg, undefined, this.tagsName)
        );

        return `\n# Previous Data for Your Context\n${contextLines.join('\n')}\n\n# Data for Coding\n`;
    }

    /**
     * Parse LLM response for deductive coding format.
     *
     * Overrides parent class to handle the markdown-based output format:
     * ```
     * # Thoughts
     * {planning text}
     *
     * # Codes (N in total):
     * 1. {code 1}; {code 2}; ...
     * 2. {code 1}; {code 2}; ...
     *
     * # Summary
     * {summary text}
     *
     * # Notes
     * {notes text}
     * ```
     *
     * This parser:
     * 1. Strips markdown headers (# prefix)
     * 2. Handles section headers: Thoughts, Codes, Summary, Notes
     * 3. Skips "Codes (N in total):" header line
     * 4. Parses numbered code entries
     * 5. Does NOT normalize codes (preserves exact codebook labels)
     * 6. Validates all codes exist in the predefined codebook
     *
     * @param analysis - The CodedThread being populated
     * @param lines - Response text split into lines
     * @param messages - Array of messages being coded
     * @returns Promise resolving to map of 1-based message indices to code strings
     * @throws InvalidResponseError if response is malformed or codes not in codebook
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

        // Prepare codebook keys for fuzzy-search
        const codebookKeys = Object.keys(analysis.codes);

        // State machine for section-based parsing
        type ParserState = "thoughts" | "codes" | "summary" | "notes" | null;
        let currentState: ParserState = null;

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            const nextLine = i + 1 < lines.length ? lines[i + 1] : "";

            // Clean up common formatting artifacts
            line = line.replaceAll(/\*\*(.*?)\*\*/g, "$1"); // Remove **bold** markdown
            line = line.replace(/^#+ /, ""); // Remove markdown headers

            // === STATE TRANSITIONS (Section Headers) ===
            if (line.startsWith("Thoughts")) {
                currentState = "thoughts";
                const content = line.includes(":") ? line.substring(line.indexOf(":") + 1).trim() : "";
                analysis.plan = content;
                continue;
            } else if (line.startsWith("Codes")) {
                currentState = "codes";
                continue;
            } else if (line.startsWith("Summary")) {
                currentState = "summary";
                const content = line.includes(":") ? line.substring(line.indexOf(":") + 1).trim() : "";
                analysis.summary = content;
                continue;
            } else if (line.startsWith("Notes")) {
                currentState = "notes";
                const content = line.includes(":") ? line.substring(line.indexOf(":") + 1).trim() : "";
                analysis.reflection = content;
                continue;
            }

            // === STATE-SPECIFIC PROCESSING ===
            if (currentState === "thoughts" && line !== "") {
                analysis.plan = `${analysis.plan}${line}\n`;
            } else if (currentState === "summary" && line !== "") {
                analysis.summary = `${analysis.summary}${line}\n`;
            } else if (currentState === "notes" && line !== "") {
                analysis.reflection = `${analysis.reflection}${line}\n`;
            } else if (currentState === "codes") {
                // === CODE EXTRACTION ===
                const match = /^(\d+)\. (.*)$/.exec(line);
                if (match) {
                    const index = parseInt(match[1]) - 1;

                    if (index < 0 || index >= messages.length) {
                        continue;
                    }

                    const message = messages[index];
                    let codes = match[2].trim();

                    // Handle multi-line format
                    if (
                        nextLine !== "" &&
                        !nextLine.startsWith("Summary") &&
                        !nextLine.startsWith("Notes") &&
                        !/^\d+\. .*$/.exec(nextLine)
                    ) {
                        codes = nextLine.trim();
                        i++;
                    }

                    // Special case overrides
                    if (message.content === "[Image]") {
                        codes = "Image Sharing";
                    }
                    if (message.content === "[Emoji]") {
                        codes = "Emoji";
                    }
                    if (message.content === "[Checkin]") {
                        codes = "Checkin";
                    }

                    // Minimal normalization for deductive coding
                    // Remove common formatting but preserve exact code labels
                    codes = codes.replaceAll(/\(.*?\)/g, "").trim(); // (explanatory note)
                    codes = codes.replaceAll(/\*(.*?)\*/g, "$1").trim(); // *emphasis*

                    // Validate and normalize codes to orthodox case from codebook
                    const codeList = codes
                        .split(/[;]/)
                        .map((c) => c.trim())
                        .filter((c) => c.length > 0 && c !== "N/A");

                    const normalizedCodes: string[] = [];
                    for (const code of codeList) {
                        // Try fuzzy-search to find best match
                        const matches = search(code.replaceAll("–", '-').replaceAll("‑", "-"), codebookKeys, { threshold: 0.9, ignoreCase: true, ignoreSymbols: true });
                        const orthodoxCase = matches.length > 0 ? matches[0] : undefined;

                        if (orthodoxCase) {
                            normalizedCodes.push(orthodoxCase);
                        } else {
                            logger.warn(
                                `Code "${code}" not found in codebook for message ${match[1]}.`,
                            );
                            normalizedCodes.push(code); // Keep original if not found
                        }
                    }

                    // Store the normalized codes (1-based indexing)
                    results[parseInt(match[1])] = normalizedCodes.join("; ");
                }
            }
        }

        // === VALIDATION ===
        if (analysis.plan === undefined) {
            throw new ItemLevelCoderBase.InvalidResponseError("The response has no thoughts");
        }
        if (analysis.reflection === undefined) {
            throw new ItemLevelCoderBase.InvalidResponseError("The response has no notes");
        }
        if (analysis.summary === undefined) {
            throw new ItemLevelCoderBase.InvalidResponseError("The response has no summary");
        }
        const expectedCount = messages.length - chunkStart;
        if (Object.keys(results).length !== expectedCount) {
            throw new ItemLevelCoderBase.InvalidResponseError(
                `${Object.keys(results).length} results for ${expectedCount} messages (${messages.length} total, ${chunkStart} context)`,
            );
        }

        return Promise.resolve(results);
    }
}
