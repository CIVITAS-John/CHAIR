/**
 * Structured chunk-level analyzer with verb phrase coding.
 *
 * This analyzer combines the hierarchical structure of ChunkLevelAnalyzerStructured
 * with the action-oriented focus of verb phrase coding.
 *
 * Based on Barany et al. (2024) but enhanced with:
 * - Two-level hierarchy (themes -> verb phrases)
 * - Explicit verb phrase requirement
 * - Summary and Plan sections
 * - Grounded theory expert framing
 *
 * Comparison to other chunk analyzers:
 * - vs. Barany: Adds hierarchy and verb phrase constraint
 * - vs. Structured: Changes from general labels to verb phrases
 * - vs. Item-level verb: Generates codebook instead of per-message codes
 *
 * Output structure:
 * ```
 * * Summary: {conversation overview}
 * * Plan: {analytical approach}
 *
 * # Theme 1
 * ## Verb phrase 1
 * Definition: {what this action represents}
 * - "example quote showing this action"
 * ```
 *
 * Benefits of verb phrase codebooks:
 * - Emphasizes processes and interactions
 * - Aligns with activity theory and practice theory
 * - Facilitates analysis of social dynamics
 * - Creates action-oriented theoretical frameworks
 * - Supports process-oriented grounded theory
 *
 * Use cases:
 * - Interaction analysis in online communities
 * - Process-oriented qualitative studies
 * - Behavioral research in digital spaces
 * - Studies of collaborative activities
 *
 * @author Barany et al. (2024) - original inspiration
 * @author John Chen - verb phrase adaptation
 */

import type { CodedThread, Conversation, Message } from "../schema.js";
import type { AIParameters } from "../steps/base-step.js";
import { BaseStep } from "../steps/base-step.js";

import { ChunkLevelAnalyzerBase } from "./chunk-level.js";
import { buildMessagePrompt } from "./conversations.js";

/**
 * Chunk-level analyzer generating hierarchical verb phrase codebooks.
 *
 * Creates structured codebooks with themes and action-oriented verb phrase codes.
 *
 * @author Barany et al. (2024) - original methodology
 * @author John Chen - verb phrase adaptations
 */
export default class ChunkLevelAnalyzerVerb extends ChunkLevelAnalyzerBase {
    /** The name of the analyzer. */
    override name = "chunk-verb";
    /** The base temperature for the LLM. */
    override baseTemperature = 0.5;

    /** Build the prompts for the LLM. */
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
You are an expert in thematic analysis with grounded theory, working on open coding.
Please give me a codebook to analyze factors within this interaction that could contribute to the research.
${dataset.researchQuestion}
${dataset.codingNotes}${customPrompt?.trim()}
Always use verb phrases. For each phrase, try to find at least 3 quotes. Always follow the output format:
---
* Summary
{A summary of the conversation}

* Plan
{A paragraph of plans and guiding questions about analyzing the conversation from multiple theoretical angles}

# Label of theme 1
## Label of phrase 1
Definition: A definition of phrase 1
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
