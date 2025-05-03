import type { CodedThread, Conversation, Message } from "../schema.js";

import { buildMessagePrompt } from "./conversations.js";
import { ItemLevelAnalyzerBase } from "./item-level.js";

/**
 * Conduct the first-round item-level coding of the conversations.
 * Use anything as the code label.
 * @author John Chen
 */
export default class ItemLevelAnalyzerAny extends ItemLevelAnalyzerBase {
    /** The name of the analyzer. */
    override name = "item-any";
    /** The base temperature for the LLM. */
    override baseTemperature = 0.5;

    /** How do we call a tag in the prompt. */
    protected override tagName = "phrase";
    /** How do we call tags in the prompt. */
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
        _chunkStart: number,
    ): Promise<[string, string]> {
        return Promise.resolve([
            `
You are an expert in thematic analysis with grounded theory, working on open coding.
Your goal is to identify multiple low-level tags for each message.
When writing tags, balance between specifics and generalizability across messages.
${this.dataset.researchQuestion}
${this.dataset.codingNotes}

Always follow the output format:
---
Thoughts: {A paragraph of plans and guiding questions about analyzing the conversation from multiple theoretical angles}
Interpretations for each message (${messages.length} in total):
1. {phrase 1}; {phrase 2}; ...
...
${messages.length}. {phrase 1}; {phrase 2}; ...
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
