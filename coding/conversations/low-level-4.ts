import { CodingNotes, ResearchQuestion } from "../../constants.js";
import { MaxItems } from "../../utils/llms.js";
import type { CodedThread, Conversation, Message } from "../../utils/schema.js";

import { BuildMessagePrompt } from "./conversations.js";
import { LowLevelAnalyzerBase } from "./low-level.js";

/** LowLevelAnalyzer4: Conduct the first-round low-level coding of the conversations. */
// Change from LowLevelAnalyzer3: We ask LLMs to produce description of the event.
// Authored by John Chen.
export default class LowLevelAnalyzer4 extends LowLevelAnalyzerBase {
    /** TagName: How do we call a tag in the prompt. */
    protected TagName = "phrase";
    /** TagsName: How do we call tags in the prompt. */
    protected TagsName = "phrases";
    /** Name: The name of the analyzer. */
    public Name = "low-level-4";
    /** BaseTemperature: The base temperature for the LLM. */
    public BaseTemperature = 0.5;
    /** GetChunkSize: Get the chunk size and cursor movement for the LLM. */
    // We will fetch at least 10 messages for each batch to keep the context.
    // We will further fetch 3 messages from the previous batch to make codes consistent.
    public GetChunkSize(
        Recommended: number,
        Remaining: number,
        Iteration: number,
        Tries: number,
    ): [number, number, number] {
        // For weaker models, we will reduce the chunk size (32 => 24 => 16 => 8)
        if (Recommended == MaxItems) {
            return [Recommended - Tries * 8, 3, 0];
        }
        return [Recommended - Tries * 2, Math.max(8 - Recommended - Tries, 3), 0];
    }
    /** BuildPrompts: Build the prompts for the LLM. */
    public async BuildPrompts(
        Analysis: CodedThread,
        Target: Conversation,
        Messages: Message[],
        ChunkStart: number,
    ): Promise<[string, string]> {
        return [
            `
You are an expert in thematic analysis with grounded theory, working on open coding.
This is the first round of coding. Your goal is to describe each messages with phrases.
Try your best to interpret events, contexts, and intents. Always use verb phrases.
${ResearchQuestion}
${CodingNotes}

Always follow the output format:
---
Thoughts: {A paragraph of plans and guiding questions about analyzing the conversation from multiple theoretical angles}
Interpretations for each message (${Messages.length} in total):
1. {phrase 1}; {phrase 2}; ...
...
${Messages.length}. {phrase 1}; {phrase 2}; ...
Summary: {A somehow detailed summary of the conversation, including previous ones}
Notes: {Notes and hypotheses about the conversation until now}`.trim(),
            Messages.map(
                (Message, Index) =>
                    `${Index + 1}. ${BuildMessagePrompt(Message, Analysis.Items[Message.ID], this.TagsName)}`,
            ).join("\n"),
        ];
    }
}
