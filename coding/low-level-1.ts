import { ResearchQuestion } from '../constants.js';
import { CodedThread, Conversation, Message } from '../utils/schema.js';
import { BuildMessagePrompt } from './conversations.js';
import { LowLevelAnalyzerBase } from './low-level.js';

/** LowLevelAnalyzer1: Conduct the first-round low-level coding of the conversations. */
// Authored by John Chen.
export class LowLevelAnalyzer1 extends LowLevelAnalyzerBase {
    /** Name: The name of the analyzer. */
    public Name: string = "low-level-1";
    /** BaseTemperature: The base temperature for the LLM. */
    public BaseTemperature: number = 0;
    /** BuildPrompts: Build the prompts for the LLM. */
    public async BuildPrompts(Analysis: CodedThread, Target: Conversation, Messages: Message[], ChunkStart: number): Promise<[string, string]> {
        return [`
You are an expert in thematic analysis. Now, you are working on the open coding.
This conversation comes from Physics Lab's online messaging groups. The goal is to identify low-level tags of each message with a focus on social interactions.
The research question is: How did Physics Lab's online community emerge?
Always follow the output format:
---
Thoughts: {Thoughts and plans about analyzing the conversation}
Analysis for all ${Messages.length} messages:
1. tag1, tag2
...
${Messages.length}. tag3, tag4
Summary: {Summary of the entire conversation}
Notes: {Summary and specific notes about the entire conversation}`.trim(),
            Messages.map((Message, Index) => `${Index + 1}. ${BuildMessagePrompt(Message)}`).join("\n")];
    }
}