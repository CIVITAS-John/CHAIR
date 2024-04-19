import { CodedThread, Conversation, Message } from '../../utils/schema';
import { BuildMessagePrompt } from './conversations.js';
import { LowLevelAnalyzerBase } from './low-level.js';

/** LowLevelAnalyzer2: Conduct the first-round low-level coding of the conversations. */
// Change from LowLevelAnalyzer1: We try to get the LLMs look from multiple angles and give more tags. Also, the temperature is raised.
// Authored by John Chen.
export class LowLevelAnalyzer2 extends LowLevelAnalyzerBase {
    /** Name: The name of the analyzer. */
    public Name: string = "low-level-2";
    /** BaseTemperature: The base temperature for the LLM. */
    public BaseTemperature: number = 0.5;
    /** BuildPrompts: Build the prompts for the LLM. */
    public BuildPrompts(Target: Conversation, Analysis: CodedThread, Messages: Message[], ChunkStart: number): [string, string] {
        return [`
You are an expert in thematic analysis. Now, you are working on the open coding.
This conversation comes from Physics Lab's online messaging groups. The goal is to identify multiple low-level tags of each message with a focus on social interactions.
The research question is: How did Physics Lab's online community emerge?
Always follow the output format:
---
Thoughts: {Thoughts and plans about analyzing the conversation from different angles.}
Analysis for all ${Messages.length} messages:
1. tag1; tag2; tag3; ...
...
${Messages.length}. tag4; tag5; tag6; ...
Summary: {Summary of the entire conversation}
Notes: {Summary and specific notes about the entire conversation}`.trim(),
            Messages.map((Message, Index) => `${Index + 1}. ${BuildMessagePrompt(Message)}`).join("\n")];
    }
}