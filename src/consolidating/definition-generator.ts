/**
 * Definition Generator Module
 *
 * This module provides classes for generating and refining code definitions using LLM.
 *
 * Two Main Classes:
 * 1. DefinitionParser: Abstract base for parsing LLM responses into code definitions
 * 2. DefinitionGenerator: Concrete implementation that generates definitions from examples
 *
 * Purpose:
 * - Add definitions to codes that lack them (from initial analysis)
 * - Refine definitions for merged codes (via RefineMerger)
 * - Parse structured LLM output into code objects
 * - Handle LLM response variations and formatting issues
 *
 * LLM Response Format:
 * The parser expects structured output like:
 * 1.
 * Criteria: {definition text}
 * Label: {code label}
 * [Category: {optional category}]
 *
 * Parsing Robustness:
 * - Handles bold markdown (**text**)
 * - Detects truncation ("...")
 * - Cleans quotes and periods from labels
 * - Validates label order matches input
 * - Continues definitions across multiple lines
 *
 * @module consolidating/definition-generator
 */

import type { Code, Codebook } from "../schema.js";
import { BaseStep } from "../steps/base-step.js";
import { logger } from "../utils/core/logger.js";

import { updateCodes } from "./codebooks.js";
import { CodeConsolidator } from "./consolidator.js";

/**
 * Abstract base class for parsing LLM-generated definitions
 *
 * This class provides the core parsing logic for extracting structured information
 * from LLM responses about code definitions, labels, and categories.
 *
 * Response Format Expected:
 * 1.
 * [Concepts: {optional, for merged codes}]
 * [Relationship: {optional, for merged codes}]
 * Criteria: {definition}
 * Label: {label} OR Phrase: {verb phrase}
 * [Category: {optional category}]
 *
 * Parsing Features:
 * - Multi-line continuation for definitions
 * - Bold markdown removal (**text** -> text)
 * - Truncation detection ("...")
 * - Quote and period cleanup
 * - Label order validation
 * - Status tracking for current field being parsed
 *
 * Error Handling:
 * - Throws InvalidResponseError if label order is wrong
 * - This helps detect when LLM mixes up code order
 *
 * Subclasses:
 * - DefinitionGenerator: Generates definitions from code examples
 * - RefineMerger: Refines definitions for merged codes (via inheritance)
 */
export abstract class DefinitionParser extends CodeConsolidator {
    /** Process codes in chunks to manage LLM token limits */
    override chunkified = true;

    /**
     * Parse LLM response and extract code definitions and labels
     *
     * This method processes LLM output line by line to extract structured code information.
     *
     * State Machine:
     * - status="": Looking for next field
     * - status="Label": Continuing multi-line label
     * - status="Criteria": Continuing multi-line definition
     * - status="Theme"/"Category": Continuing multi-line category
     *
     * Field Detection:
     * - Number (1., 2., etc.): Starts new code
     * - "Label:" or "Phrase:": Sets label
     * - "Criteria:": Starts definition
     * - "Category:": Starts category
     *
     * Post-Processing:
     * - Removes "label:" or "phrase:" prefix if present
     * - Removes surrounding quotes
     * - Removes trailing periods
     * - Validates label order matches input codes
     *
     * Updates:
     * - Calls updateCodes to apply changes to codebook
     * - Cleans up temporary oldLabels field
     *
     * Cursor Movement:
     * - Returns difference between parsed and input codes
     * - Negative means fewer codes parsed than expected
     * - Used for retry logic in analyzer
     *
     * @param codebook - Full codebook for label collision detection
     * @param codes - Codes being processed (in order)
     * @param lines - LLM response split into trimmed lines
     * @returns Cursor movement (usually 0 or negative if truncated)
     */
    override parseResponse(codebook: Codebook, codes: Code[], lines: string[]) {
        const pendings: Code[] = [];
        let curCode: Code | undefined;
        let status = "";

        // Parse the definitions line by line
        for (let line of lines) {
            // Skip empty lines and dividers
            if (line === "" || line.startsWith("---")) {
                continue;
            }

            // Remove markdown bold formatting that LLMs sometimes add
            line = line.replace(/\*\*/g, "");

            // "..." indicates LLM truncated output, stop parsing
            if (line === "...") {
                break;
            }

            // Detect numbered code (e.g., "1.", "2.")
            const match = /^\d+\./.exec(line);
            if (match) {
                line = line.substring(match[0].length).trim();
                // Create new code object (label might be on this line or next)
                curCode = {
                    label: line.trim().toLowerCase(),
                    definitions: [],
                    categories: [],
                    examples: [],
                    alternatives: [],
                };
                pendings.push(curCode);
                status = "";
            }

            // Detect field markers and extract content
            if (line.startsWith("Label:") && curCode) {
                curCode.label = line.substring(6).trim().toLowerCase();
                status = "Label";
            } else if (line.startsWith("Phrase:") && curCode) {
                curCode.label = line.substring(7).trim().toLowerCase();
                status = "Label";
            } else if (line.startsWith("Criteria:") && curCode) {
                const definition = line.substring(9).trim();
                if (definition !== "") {
                    curCode.definitions = [definition];
                }
                status = "Criteria";
            } else if (line.startsWith("Category:") && curCode) {
                const Category = line.substring(9).trim();
                if (Category !== "") {
                    curCode.categories = [Category.toLowerCase()];
                }
                status = "Category";
            } else if (status === "Label" && curCode) {
                // Continue multi-line label
                curCode.label = `${curCode.label}\n${line}`.trim();
            } else if (status === "Criteria" && curCode) {
                // Continue multi-line definition
                curCode.definitions?.push(line.trim());
            } else if (status === "Theme" && curCode) {
                // Continue multi-line category
                if (line.endsWith(".")) {
                    line = line.substring(0, line.length - 1).trim();
                }
                curCode.categories?.push(line.trim());
            }
        }

        // Post-process parsed codes to clean up labels
        for (let i = 0; i < pendings.length; i++) {
            const newCode = pendings[i];

            // Remove "label:" prefix if LLM added it
            if (newCode.label.startsWith("label:")) {
                newCode.label = newCode.label.substring(6).trim();
            }

            // Remove "phrase:" prefix if LLM added it
            if (newCode.label.startsWith("phrase:")) {
                newCode.label = newCode.label.substring(7).trim();
            }

            // Remove surrounding quotes
            if (newCode.label.startsWith('"') && newCode.label.endsWith('"')) {
                newCode.label = newCode.label.substring(1, newCode.label.length - 1);
            }

            // Remove trailing period
            if (newCode.label.endsWith(".")) {
                newCode.label = newCode.label.substring(0, newCode.label.length - 1).trim();
            }

            // Validate label order matches input (catches LLM errors)
            const Found = codes.findIndex((Code) => Code.label === newCode.label);
            if (Found !== -1 && Found !== i) {
                throw new CodeConsolidator.InvalidResponseError(
                    `Invalid response: code ${newCode.label}'s mapping order is wrong (was at ${Found}, now at ${i}).`,
                );
            }
        }

        // Apply updates to codebook
        updateCodes(codebook, pendings, codes);

        // Clean up temporary oldLabels field
        codes.forEach((Code) => delete Code.oldLabels);

        // Return cursor movement
        return Promise.resolve(Object.keys(pendings).length - codes.length);
    }
}

/**
 * Consolidator that generates definitions for codes lacking them
 *
 * This is typically the final stage in consolidation, adding definitions to codes
 * that emerged from analysis or merging without clear definitions.
 *
 * Process:
 * 1. Filter to codes without definitions
 * 2. Present LLM with code label and example quotes
 * 3. LLM generates criteria (definition) and optionally refines label
 * 4. Parse response and update codes
 *
 * Key Features:
 * - Only processes codes lacking definitions (efficiency)
 * - Uses curated examples (via takeExamples helper)
 * - Allows label refinement while maintaining coder intent
 * - Tracks merge statistics in postprocess
 *
 * Prompt Design:
 * - Emphasizes clarity and generalizability
 * - Warns against introducing unnecessary details
 * - Instructs to follow coder's intent and style
 * - Includes research question for context
 *
 * Statistics Logging:
 * - Counts definitions generated
 * - Tracks implicit merges (label changes)
 * - Sanity checks merge counts
 */
export class DefinitionGenerator extends DefinitionParser {
    protected override get _prefix() {
        return logger.prefixed(logger.prefix, "DefinitionGenerator");
    }

    /**
     * Parse response with filtering and statistics
     *
     * Overrides parent to:
     * 1. Filter to codes without definitions before parsing
     * 2. Log detailed statistics about what was generated
     *
     * This filtering is necessary here (not in buildPrompts) because the
     * codes array needs to match the LLM response order.
     *
     * @param codebook - Full codebook
     * @param codes - All codes in chunk
     * @param lines - LLM response lines
     * @returns Cursor movement from parent parseResponse
     */
    override async parseResponse(codebook: Codebook, codes: Code[], lines: string[]) {
        // Filter has to happen here to match LLM response order
        const oldcodes = codes.filter((Code) => (Code.definitions?.length ?? 0) === 0);
        const result = await super.parseResponse(codebook, oldcodes, lines);
        logger.debug(
            `Generated ${oldcodes.filter((Code) => (Code.definitions?.length ?? 0) > 0).length} definitions for ${oldcodes.length} codes (${codes.length} in total), cursor movement ${result}.`,
        );
        return result;
    }

    /**
     * Log final statistics after all definitions generated
     *
     * Tracks:
     * - Total definitions generated
     * - Number of codes implicitly merged (via label changes)
     * - Sanity check on merge counts
     *
     * oldLabels Presence:
     * - Should only exist on codes from RefineMerger
     * - DefinitionGenerator shouldn't create oldLabels
     * - If present, indicates unexpected merging
     *
     * @param subunits - All codes after generation
     * @returns Cleaned codes (via parent postprocess)
     */
    override postprocess(subunits: Code[]): Promise<Code[]> {
        const mergedCodes = subunits.filter((Code) => (Code.oldLabels?.length ?? 0) > 0);
        const mergedCount = mergedCodes.reduce(
            (acc, Code) => acc + (Code.oldLabels?.length ?? 0),
            0,
        );
        logger.success(
            `Generated ${subunits.filter((Code) => (Code.definitions?.length ?? 0) > 0).length} definitions for ${subunits.length} codes, with ${subunits.filter((Code) => Code.label === "[Merged]").length} implicitly merged. Sanity check: ${mergedCodes.length} codes merged ${mergedCount}.`,
        );
        return super.postprocess(subunits);
    }

    /**
     * Build prompts for definition generation
     *
     * Creates prompts that:
     * 1. Establish LLM as thematic analysis expert
     * 2. Warn against merging independent codes
     * 3. Request clear, generalizable criteria
     * 4. Allow label refinement if needed for accuracy
     * 5. Provide research question context
     * 6. Show code labels with curated example quotes
     *
     * Example Selection:
     * - Uses takeExamples to select best quotes
     * - Prefers longer, more frequent examples
     * - Up to 5 examples per code
     * - Removes ID prefixes for readability
     *
     * Output Format:
     * 1.
     * Criteria: {who did what, and how}
     * Label: {original or refined label}
     *
     * @param _codebook - Current codebook (unused)
     * @param codes - Codes needing definitions
     * @returns [system prompt, user prompt]
     */
    override buildPrompts(_codebook: Codebook, codes: Code[]): Promise<[string, string]> {
        const { dataset } = BaseStep.Context.get();
        codes = codes.filter((Code) => (Code.definitions?.length ?? 0) === 0);
        // Generate definitions for codes
        return Promise.resolve([
            `
You are an expert in thematic analysis clarifying the criteria of qualitative codes. 
Each code is independent of others. Do not attempt to merge codes (i.e. using one code's label for another code)
Write clear and generalizable criteria for each code and do not introduce unnecessary details.
Try to understand and follow the coder's intention by considering provided quotes. Each quote is independent of others. 
If necessary for accuracy and clarity, refine labels, but follow the corresponding input label's intent and style.
${dataset.researchQuestion}
Always follow the output format:
---
Definitions for each code (${codes.length} in total):
1. 
Criteria: {Who did what, and how for code 1}
Label: {The original or refined label of code 1}
...
${codes.length}.
Criteria: {Who did what, and how for code ${codes.length}}
Label: {The original or refined label of code ${codes.length}}
---`.trim(),
            codes
                .map((code, idx) =>
                    `
${idx + 1}.
Label: ${code.label}
Quotes:
${takeExamples(code.examples ?? [], 5)
    .map((example) => `- ${example}`)
    .join("\n")}`.trim(),
                )
                .join("\n\n"),
        ]);
    }
}

/**
 * Select best unique examples from a code's example list
 *
 * Uses a scoring system to prioritize examples that are:
 * 1. More frequent (appeared in more data items)
 * 2. Longer (contain more context)
 *
 * Scoring Formula:
 * score = frequency * length
 *
 * This balances between:
 * - Frequent examples: Show common patterns in the data
 * - Long examples: Provide rich context for understanding
 *
 * ID Prefix Handling:
 * - Examples may have "ID|||content" format
 * - Strips ID prefix if "|||" delimiter found
 * - Deduplicates on content after ID removal
 *
 * Typical Usage:
 * takeExamples(code.examples, 5) // Get top 5 examples for LLM prompt
 *
 * @param examples - Array of example strings (may include ID prefixes)
 * @param take - Maximum number of examples to return (default: all)
 * @returns Sorted array of best examples (highest score first)
 */
const takeExamples = (examples: string[], take = 1000000) => {
    const exampleMap = new Map<string, number>();

    // Count frequency of each unique example (after removing ID prefix)
    for (let example of examples) {
        const Index = example.indexOf("|||");
        if (Index !== -1) {
            example = example.substring(Index + 3);
        }
        exampleMap.set(example, exampleMap.get(example) ?? 0 + 1);
    }

    // Convert frequency to score (frequency * length)
    for (const [example, count] of exampleMap) {
        exampleMap.set(example, count * example.length);
    }

    // Sort by score descending and take top N
    return Array.from(exampleMap.keys())
        .sort((A, B) => (exampleMap.get(B) ?? 0) - (exampleMap.get(A) ?? 0))
        .slice(0, take);
};
