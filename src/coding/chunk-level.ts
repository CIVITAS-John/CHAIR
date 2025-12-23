/**
 * Chunk-level conversation analysis base classes and utilities.
 *
 * This file provides the foundation for chunk-level coding strategies where entire
 * conversations (or large chunks) are analyzed holistically to generate a codebook
 * with categories, codes, definitions, and examples.
 *
 * Unlike item-level coding which assigns codes to individual messages, chunk-level
 * coding takes a top-down approach:
 * 1. Analyze the entire conversation to identify themes and patterns
 * 2. Generate a structured codebook with categories and codes
 * 3. Provide definitions and example quotes for each code
 * 4. Extract summary and analysis plan metadata
 *
 * Key features:
 * - Processes entire conversations in single chunks (no adaptive sizing)
 * - Parses hierarchical codebook structure (categories -> codes -> examples)
 * - Handles various LLM formatting patterns for code labels and definitions
 * - Matches example quotes back to original messages
 * - Fuzzy matching for quotes with minor LLM modifications
 * - Reverts special message markers to canonical form
 *
 * This approach is inspired by traditional qualitative coding where researchers
 * develop a codebook by reading and analyzing the full dataset.
 *
 * @author John Chen
 */

import { Analyzer } from "../analyzer.js";
import type { Code, CodedThread, Message } from "../schema.js";
import { BaseStep } from "../steps/base-step.js";
import { logger } from "../utils/core/logger.js";
import { assembleExampleFrom } from "../utils/core/misc.js";

import { ConversationAnalyzer, revertMessageFormat } from "./conversations.js";

/**
 * Abstract base class for chunk-level coding analyzers.
 *
 * Chunk-level coding analyzes entire conversations to generate a structured
 * codebook with categories, codes, definitions, and supporting examples. This
 * approach mirrors traditional grounded theory codebook development.
 *
 * Expected LLM response format:
 * ```
 * * Summary
 * {conversation summary}
 *
 * * Plan
 * {analysis approach}
 *
 * # Category Name
 * ## Code Label
 * Definition: {code definition}
 * - "example quote 1" (ID: 123)
 * - "example quote 2"
 * ```
 *
 * Processing characteristics:
 * - No chunking: processes entire conversation at once
 * - No item-level codes: returns 0 to indicate chunk-level only
 * - Generates structured Code objects with categories, definitions, and examples
 * - Performs fuzzy matching to link quotes back to messages
 *
 * Subclasses must implement:
 * - buildPrompts(): Create system and user prompts for codebook generation
 * - name: Unique identifier for the analyzer
 *
 * @author John Chen
 */
export abstract class ChunkLevelAnalyzerBase extends ConversationAnalyzer {
    /**
     * Determine chunk size for processing.
     *
     * Chunk-level analyzers always process the entire remaining conversation
     * in a single chunk. This allows the LLM to see the full context when
     * developing the codebook.
     *
     * @param _recommended - Recommended chunk size (ignored)
     * @param remaining - Number of remaining messages
     * @returns The number of remaining messages (process all at once)
     */
    override getChunkSize(_recommended: number, remaining: number) {
        return remaining;
    }

    /**
     * Parse LLM response to extract codebook structure and metadata.
     *
     * This method parses a hierarchical codebook response containing:
     * - Summary: Overview of the conversation
     * - Plan: Analysis approach and guiding questions
     * - Categories: Top-level thematic groupings (# headers)
     * - Codes: Specific codes within categories (## headers)
     * - Definitions: Explanations of what each code means
     * - Examples: Quote snippets with optional message IDs
     *
     * Parsing process:
     * 1. Extract summary and plan from * Summary and * Plan sections
     * 2. Track current category from # headers
     * 3. Create Code objects from ## headers with label normalization
     * 4. Extract definitions from "Definition:" lines
     * 5. Extract examples from "- " bullet points
     * 6. Match quotes to original messages (exact or fuzzy)
     * 7. Handle various LLM formatting quirks
     *
     * Quote matching strategy:
     * - Try exact match first
     * - Fall back to fuzzy matching (substring/contains)
     * - Handle truncated quotes (ending with "...")
     * - Log warnings for unmatched quotes
     * - Revert special markers like [Image 123] to [Image]
     *
     * @param analysis - CodedThread to populate with codes and metadata
     * @param lines - Response text split into lines
     * @param messages - Array of messages in the conversation
     * @param _chunkStart - Starting index of chunk (unused)
     * @returns Promise resolving to 0 (no item-level codes generated)
     */
    override parseResponse(
        analysis: CodedThread,
        lines: string[],
        messages: Message[],
        _chunkStart: number,
    ): Promise<number> {
        return logger.withDefaultSource("parseResponse", () => {
            const { dataset } = BaseStep.Context.get();

            let category = "";              // Current category being parsed
            let position = "";               // Current multi-line section (Summary/Plan)
            let currentCode: Code | undefined; // Code currently being populated

            // === PARSE RESPONSE LINE BY LINE ===
            for (let line of lines) {
                // --- Extract Summary ---
                if (line.startsWith("* Summary")) {
                    analysis.summary = line.substring(9).trim();
                    if (analysis.summary === "") {
                        position = "Summary"; // Multi-line summary follows
                    }

                // --- Extract Plan ---
                } else if (line.startsWith("* Plan")) {
                    analysis.plan = line.substring(8).trim();
                    if (analysis.plan === "") {
                        position = "Plan"; // Multi-line plan follows
                    }

                // --- Extract Category (# header) ---
                } else if (line.startsWith("# ")) {
                    position = "";
                    category = line.substring(2).trim();

                // --- Extract Code (## header) with normalization ---
                } else if (line.startsWith("## ")) {
                    position = "";
                    line = line.substring(3).trim();

                    // Reject placeholder codes like "P1", "P2" from lazy LLMs
                    if (/^P\d+(?:$|:)/.exec(line)) {
                        throw new Analyzer.InvalidResponseError(`Invalid code name: ${line}`);
                    }

                    // Remove various formatting artifacts from code labels
                    line = line.replace(/^\*\*(.*)\*\*/, "$1").trim();     // **bold** -> bold
                    line = line.replace(/^\d+\.*/, "").trim();              // 1. code -> code
                    line = line.replace(/^(?:Label|Code)\s*\d*:/, "").trim(); // Label: code -> code

                    // Normalize to lowercase for consistent lookup
                    line = line.trim().toLowerCase();

                    // Get or create the code object
                    currentCode = analysis.codes[line] ?? {
                        categories: [category.toLowerCase()],
                        label: line,
                    };
                    analysis.codes[line] = currentCode;

                // --- Extract Definition ---
                } else if (line.startsWith("Definition: ")) {
                    if (currentCode) {
                        line = line.substring(12).trim();
                        currentCode.definitions = [line];
                    }

                // --- Append to multi-line Summary ---
                } else if (position === "Summary") {
                    analysis.summary = `${analysis.summary}\n${line.trim()}`.trim();

                // --- Append to multi-line Plan ---
                } else if (position === "Plan") {
                    analysis.plan = `${analysis.plan}\n${line.trim()}`.trim();

                // --- Extract Example Quotes ---
                } else if (line.startsWith("- ")) {
                    if (currentCode) {
                        line = line.substring(2).trim();

                        // Extract optional message ID if present: (ID: 123)
                        let Index = line.lastIndexOf("(ID:");
                        if (Index !== -1) {
                            const ID = parseInt(line.substring(Index + 4, line.length - 1));
                            line = line.substring(0, Index).trim();
                            Index = ID;
                        }

                        // === QUOTE NORMALIZATION ===
                        // Remove various LLM formatting artifacts from quotes

                        line = line.replace(/^Example quote \d+:/, "").trim(); // "Example quote 1: text" -> "text"
                        line = line.replace(/^tag\d+:/, "").trim();            // "tag1: text" -> "text"
                        line = line.replace(/^"(.*)"/, "$1").trim();           // "quoted" -> quoted
                        line = line.replace(/^([^(]*)\(.+\)$/, "$1").trim();  // "text (Author)" -> "text"
                        line = line.replace(/^\*\*(.*)\*\*/, "$1").trim();    // **bold** -> bold
                        line = line.replace(/^(?:User|Designer)-\d+:/, "").trim(); // "User-123: text" -> "text"

                        // Revert special message markers: [Image 42] -> [Image]
                        line = revertMessageFormat(line);

                        // === MESSAGE MATCHING ===
                        // Try to match the quote to an original message

                        currentCode.examples = currentCode.examples ?? [];

                        // Attempt 1: Exact match
                        let message = messages.find((m) => m.content === line);

                        // Attempt 2: Fuzzy match (for truncated or modified quotes)
                        if (!message) {
                            let lowerLine = line.toLowerCase();

                            // Handle truncated quotes ending with "..."
                            const truncateIndex = lowerLine.indexOf("...");
                            if (truncateIndex !== -1) {
                                lowerLine = lowerLine.substring(0, truncateIndex).trim();
                            }

                            // Remove trailing period if present
                            if (lowerLine.endsWith(".")) {
                                lowerLine = lowerLine.substring(0, lowerLine.length - 1);
                            }

                            // Try substring matching (bidirectional contains)
                            message = messages.find((m) => {
                                const lower = m.content.toLowerCase();
                                return lower.includes(lowerLine) || lowerLine.includes(lower);
                            });
                        }

                        // Log warning if no match found (LLM may have paraphrased)
                        if (!message) {
                            logger.warn(
                                `Cannot find the coded message for: ${line}. The LLM has likely slightly changed the content.`,
                            );
                        }

                        // Assemble example string or use quote as-is
                        const example = message ? assembleExampleFrom(dataset, message) : line;

                        // Add to examples list (avoid duplicates)
                        if (message && !currentCode.examples.includes(example)) {
                            currentCode.examples.push(example);
                        }
                    }
                }
            }

            // Clean up placeholder codes that may appear in responses
            delete analysis.codes["..."];

            // Return 0 to indicate no item-level codes were generated
            // (only chunk-level codebook was created)
            return Promise.resolve(0);
        });
    }
}
