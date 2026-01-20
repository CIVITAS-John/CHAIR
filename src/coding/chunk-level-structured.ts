/**
 * Structured chunk-level analyzer with hierarchical codebook generation.
 *
 * This analyzer is based on the methodology from Barany et al. (2024) "ChatGPT for
 * Education Research: Exploring the Potential of Large Language Models for Qualitative
 * Codebook Development," with significant enhancements.
 *
 * Key modifications from the original Barany approach:
 * 1. Added explicit example formatting in prompts (original didn't specify)
 * 2. Added planning stage ("Plan" section) for analytical transparency
 * 3. Requested two-level hierarchy (categories + codes) instead of flat codes
 * 4. Specified structured output format with Summary and Plan sections
 * 5. Enhanced for general research contexts beyond education
 *
 * Codebook structure generated:
 * ```
 * * Summary: {conversation overview}
 * * Plan: {analytical approach and guiding questions}
 *
 * # Category 1
 * ## Code 1.1
 * Definition: {what this code means}
 * - "example quote 1"
 * - "example quote 2"
 * ```
 *
 * Differences from ChunkLevelAnalyzerBarany:
 * - Barany: Single flat level of codes
 * - Structured: Two-level hierarchy (categories -> codes)
 * - Barany: Minimal metadata
 * - Structured: Explicit Summary and Plan sections
 *
 * Use cases:
 * - Exploratory research needing organized codebooks
 * - Studies requiring hierarchical code organization
 * - Team-based coding with clear code definitions
 * - Mixed-methods research needing structured outputs
 *
 * @author Barany et al. (2024)
 * @author John Chen (adaptations)
 */

import type { CodedThread, Conversation, Message } from "../schema.js";
import type { AIParameters } from "../steps/base-step.js";
import { BaseStep } from "../steps/base-step.js";

import { ChunkLevelAnalyzerBase } from "./chunk-level.js";
import { buildMessagePrompt } from "./conversations.js";

/**
 * Chunk-level analyzer generating hierarchical structured codebooks.
 *
 * Creates two-level code hierarchies with categories, codes, definitions, and examples.
 *
 * @author Barany et al. (2024)
 * @author John Chen (adaptations)
 */
export default class ChunkLevelAnalyzerStructured extends ChunkLevelAnalyzerBase {
    /** Unique identifier for this analyzer */
    override name = "chunk-structured";

    /** LLM temperature (0.5 for balanced creativity) */
    override baseTemperature = 0.5;

    /**
     * Build prompts for structured hierarchical codebook generation.
     *
     * Creates prompts that request:
     * - Summary of the conversation
     * - Plan with analytical approach and guiding questions
     * - Hierarchical categories and codes
     * - Definitions for each code
     * - Example quotes supporting each code
     *
     * The prompt is framed as a request to ChatGPT to generate a codebook,
     * maintaining the conversational style of Barany et al. while adding
     * explicit structure and metadata requirements.
     *
     * @param _analysis - CodedThread (unused)
     * @param _target - Conversation (unused)
     * @param messages - Messages to analyze
     * @param _chunkStart - Chunk start index (unused)
     * @returns [systemPrompt, userPrompt]
     */
    override buildPrompts(
        _analysis: CodedThread,
        _target: Conversation,
        messages: Message[],
        _contexts: Message[],
        _chunkStart: number,
        _iteration: number,
        aiParams?: AIParameters,
    ): Promise<[string, string]> {
        const { dataset } = BaseStep.Context.get();

        // Combine base customPrompt with runtime aiParams customPrompt
        const basePrompt = this.customPrompt || "";
        const runtimePrompt = aiParams?.customPrompt ? `\n${aiParams.customPrompt}` : "";
        const customPrompt = basePrompt + runtimePrompt;

        return Promise.resolve([
            `
Hi ChatGPT, I want to analyze the following interaction in one of Physics Lab's online message groups.
Please give me a codebook to analyze factors within this interaction that could contribute to the research.
${dataset.researchQuestion}
${dataset.codingNotes}${customPrompt?.trim()}
For each code, try to find 3 quotes. Always follow the output format:
---
* Summary
{A summary of the conversation}

* Plan
{A paragraph of plans and guiding questions about analyzing the conversation from multiple theoretical angles}

# Label of category 1
## Label of code 1
Definition: A definition of code 1
- "Example quote 1"
- "Example quote 2"

## ...
# ...
`.trim(),
            messages
                .map((message, idx) => `${idx + 1}. ${buildMessagePrompt(dataset, message)}`)
                .join("\n"),
        ]);
    }
}
