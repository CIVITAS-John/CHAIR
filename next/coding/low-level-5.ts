import type { CodedThread, Conversation, Message } from "../schema";

import { buildMessagePrompt } from "./conversations";
import { LowLevelAnalyzerBase } from "./low-level";

/** Conduct the first-round low-level coding of the conversations.
 * Change from LowLevelAnalyzer4: We added a few instructions to enforce verb phrases for weaker LLMs.
 * @author John Chen
 */
export default class LowLevelAnalyzer5 extends LowLevelAnalyzerBase {
    /** The name of the analyzer. */
    override name = "low-level-5";
    /** The base temperature for the LLM. */
    override baseTemperature = 0.5;

    /** How we call a tag in the prompt */
    protected override tagName = "phrase";
    /** How we call tags in the prompt */
    protected override tagsName = "phrases";

    /**
     * Get the chunk size and cursor movement for the LLM.
     * We will fetch at least 10 messages for each batch to keep the context.
     * We will further fetch 3 messages from the previous batch to make codes consistent.
     */
    override getChunkSize(
        recommended: number,
        _remaining: number,
        _iteration: number,
        tries: number,
    ): [number, number, number] {
        // For weaker models, we will reduce the chunk size (32 => 24 => 16 => 8)
        if (recommended === this.session.llm.maxItems) {
            return [recommended - tries * 8, 3, 0];
        }
        return [recommended - tries * 2, Math.max(8 - recommended - tries, 3), 0];
    }

    /** Build the prompts for the LLM. */
    override buildPrompts(
        analysis: CodedThread,
        _target: Conversation,
        messages: Message[],
    ): Promise<[string, string]> {
        return Promise.resolve([
            `
You are an expert in thematic analysis with grounded theory, working on open coding.
This is the first round of coding. Your goal is to describe each item with verb phrases.
Try your best to interpret events, contexts, and intents. Always use ";" to separate verb phrases.
${this.dataset.researchQuestion}
${this.dataset.codingNotes}

Always follow the output format:
---
Thoughts: {A paragraph of plans and guiding questions about analyzing the conversation from multiple theoretical angles}
Interpretation phrases for each item (${messages.length} in total):
1. {phrase 1}; {phrase 2}; {phrase 3}; ...
...
${messages.length}. {phrase 1}; {phrase 2}; {phrase 3}; ...
Summary: {A somehow detailed summary of the conversation, including previous ones}
Notes: {Notes and hypotheses about the conversation until now}`.trim(),
            messages
                .map(
                    (message, idx) =>
                        `${idx + 1}. ${buildMessagePrompt(this.dataset, message, analysis.items[message.id], this.tagsName)}`,
                )
                .join("\n"),
        ]);
    }
}
