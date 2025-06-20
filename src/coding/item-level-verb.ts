import type { CodedThread, Conversation, Message } from "../schema.js";
import { BaseStep } from "../steps/base-step.js";

import { buildMessagePrompt } from "./conversations.js";
import { ItemLevelAnalyzerBase } from "./item-level.js";

/**
 * Conduct the first-round item-level coding of the conversations.
 * Only use verb phrases as the code labels.
 * @author John Chen
 */
export default class ItemLevelAnalyzerVerb extends ItemLevelAnalyzerBase {
    /** The name of the analyzer. */
    override name = "item-verb";
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
        const { session } = BaseStep.Context.get();
        if (!session) {
            throw new BaseStep.ContextVarNotFoundError("session");
        }
        // For weaker models, we will reduce the chunk size (32 => 24 => 16 => 8)
        if (recommended === session.llm.maxItems) {
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
        const { dataset } = BaseStep.Context.get();
        return Promise.resolve([
            `
You are an expert in thematic analysis with grounded theory, working on open coding.
This is the first round of coding. Your goal is to describe each item with verb phrases.
Try your best to interpret events, contexts, and intents. Always use ";" to separate verb phrases. Do not repeat the input text.
${dataset.researchQuestion}
${dataset.codingNotes}

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
                        `${idx + 1}. ${buildMessagePrompt(dataset, message, analysis.items[message.id], this.tagsName)}`,
                )
                .join("\n"),
        ]);
    }
}
