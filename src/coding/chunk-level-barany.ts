/**
 * Chunk-level analyzer implementing Barany et al. methodology.
 *
 * This analyzer closely follows the approach described in Barany et al. (2024)
 * "ChatGPT for Education Research: Exploring the Potential of Large Language
 * Models for Qualitative Codebook Development."
 *
 * Original Barany et al. prompt (simplified):
 * "Hi ChatGPT, I want to analyze the following interaction between an instructor
 * and some students: [DATA]. Please give me a codebook to analyze the instructional
 * methodologies and the sentiment within this interaction."
 *
 * Our modifications:
 * 1. Added explicit example quote formatting (original paper didn't specify format)
 * 2. Adapted for general research contexts beyond education
 * 3. Integrated with research question and coding notes from dataset
 *
 * Key characteristics:
 * - Single flat level of codes (no hierarchical categories)
 * - Simple ## header format for code labels
 * - Definitions and example quotes for each code
 * - Conversational prompt style ("Hi ChatGPT...")
 * - Typical output: 8-11 codes per conversation
 *
 * Differences from ChunkLevelAnalyzerStructured:
 * - Barany: Flat code list
 * - Structured: Two-level hierarchy with categories
 * - Barany: Minimal structure
 * - Structured: Explicit Summary and Plan sections
 *
 * Use cases:
 * - Replicating Barany et al. methodology
 * - Simple, flat codebook generation
 * - Quick exploratory coding
 * - Studies needing concise code sets
 *
 * @author Barany et al. (2024)
 * @author John Chen (adaptations)
 */

import type { CodedThread, Conversation, Message } from "../schema.js";
import { BaseStep } from "../steps/base-step.js";

import { ChunkLevelAnalyzerBase } from "./chunk-level.js";
import { buildMessagePrompt } from "./conversations.js";

/**
 * Chunk-level analyzer implementing Barany et al. flat codebook methodology.
 *
 * Generates flat (non-hierarchical) codebooks with definitions and examples.
 *
 * @author Barany et al. (2024)
 * @author John Chen (adaptations)
 */
export default class ChunkLevelAnalyzerBarany extends ChunkLevelAnalyzerBase {
    /** The name of the analyzer. */
    override name = "chunk-barany";
    /** The base temperature for the LLM. */
    override baseTemperature = 0.5;

    /** Build the prompts for the LLM. */
    override buildPrompts(
        _analysis: CodedThread,
        _target: Conversation,
        messages: Message[],
        _chunkStart: number,
    ): Promise<[string, string]> {
        const { dataset } = BaseStep.Context.get();
        return Promise.resolve([
            `
Hi ChatGPT, I want to analyze the following interaction in one of Physics Lab's online message groups.
Please give me a codebook to analyze factors within this interaction that could contribute to the research.
${dataset.researchQuestion}
${dataset.codingNotes}${this.customPrompt}
For each code, try to find 3 quotes. Always follow the output format:
---
## Label: A label of code 1
Definition: A definition of code 1
- "Example quote 1"
- "Example quote 2"

## ...
`.trim(),
            messages
                .map((message, idx) => `${idx + 1}. ${buildMessagePrompt(dataset, message)}`)
                .join("\n"),
        ]);
    }
}
