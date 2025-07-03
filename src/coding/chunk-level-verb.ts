import type { CodedThread, Conversation, Message } from "../schema.js";
import { BaseStep } from "../steps/base-step.js";

import { ChunkLevelAnalyzerBase } from "./chunk-level.js";
import { buildMessagePrompt } from "./conversations.js";

/**
 * Original prompt format:
 * Hi ChatGPT, I want to analyze the following interaction between an instructor and some students:
 * [DATA]
 * Please give me a codebook to analyze the instructional methodologies and the sentiment within this interaction.
 * ---
 * Barany et al. (2024) ChatGPT for Education Research: Exploring the Potential of Large Language Models for Qualitative Codebook Development
 * ---
 * However, the original prompt does not give examples as documented by the paper. We modified the prompt to make that happen. Note that the original paper's codebook only has around 8-11 codes. Therefore, we only ask ChatGPT to generate a single layer of codes.
 * Changes from ChunkLevelAnalyzerStructured: We asked LLMs to write verb phrases.
 *
 * @author Barany et al.
 * Adapted by John Chen.
 */

/** Conduct the first-round high-level coding of the conversations. */
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
        _chunkStart: number,
    ): Promise<[string, string]> {
        const { dataset } = BaseStep.Context.get();
        return Promise.resolve([
            `
You are an expert in thematic analysis with grounded theory, working on open coding.
Please give me a codebook to analyze factors within this interaction that could contribute to the research.
${dataset.researchQuestion}
${dataset.codingNotes}${this.customPrompt}
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
