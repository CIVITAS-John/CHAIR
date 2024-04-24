import { MaxItems } from '../../utils/llms.js';
import { CodedThread, Conversation, Message } from '../../utils/schema.js';
import { BuildMessagePrompt } from './conversations.js';
import { LowLevelAnalyzerBase } from './low-level.js';

/** LowLevelAnalyzer3: Conduct the first-round low-level coding of the conversations. */
// Change from LowLevelAnalyzer2: We try to give some more background on the data and directions. Also, improved the prompt for the planning stage.
// Authored by John Chen.
export class LowLevelAnalyzer3 extends LowLevelAnalyzerBase {
    /** Name: The name of the analyzer. */
    public Name: string = "low-level-3";
    /** BaseTemperature: The base temperature for the LLM. */
    public BaseTemperature: number = 0.5;
    /** GetChunkSize: Get the chunk size and cursor movement for the LLM. */
    // We will fetch at least 10 messages for each batch to keep the context.
    // We will further fetch 3 messages from the previous batch to make codes consistent.
    public GetChunkSize(Recommended: number, Remaining: number, Iteration: number, Tries: number): [number, number, number] {
        // For weaker models, we will reduce the chunk size (32 => 24 => 16 => 8)
        if (Recommended == MaxItems) return [Recommended - Tries * 8, 3, 0];
        return [Recommended - Tries * 2, Math.max(8 - Recommended - Tries, 3), 0];
    }
    /** BuildPrompts: Build the prompts for the LLM. */
    public async BuildPrompts(Analysis: CodedThread, Target: Conversation, Messages: Message[], ChunkStart: number): Promise<[string, string]> {
        return [`
You are an expert in thematic analysis with grounded theory, working on open coding.
Your goal is to identify multiple low-level tags for each message. Tags are short phrases that can be applied across messages.
The research question is: How did Physics Lab's online community emerge?
"Designer" is the person who designed and developed Physics Lab.

Always follow the output format:
---
Thoughts: {A paragraph of thoughts, plans, and guiding questions about analyzing the conversation from different angles}
Tags for each message (${Messages.length} in total):
1. tag1; tag2; tag3...
...
${Messages.length}. tag4; tag5; tag6; ...
Summary: {A somehow detailed summary of the conversation, including previous ones}
Notes: {Notes and hypotheses about the conversation until now}`.trim(),
            Messages.map((Message, Index) => `${Index + 1}. ${BuildMessagePrompt(Message, Analysis.Items[Message.ID])}`).join("\n")];
    }
}