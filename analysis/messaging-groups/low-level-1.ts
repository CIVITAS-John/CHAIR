import { CodedThread, Conversation, Message } from '../../utils/schema';
import { Analyzer } from '../analyzer.js';
import { BuildMessagePrompt } from './conversations.js';

/** LowLevelAnalyzer1: Conduct the first-round low-level coding of the conversations. */
// Authored by John Chen.
export class LowLevelAnalyzer1 implements Analyzer<Conversation> {
    /** Name: The name of the analyzer. */
    public Name: string = "low-level-1";
    /** BuildPrompts: Build the prompts for the LLM. */
    public BuildPrompts(Target: Conversation, Analysis: CodedThread, Messages: Message[]): [string, string] {
        return [`
You are an expert in thematic analysis. Now, you are working on the open coding.
This conversation comes from Physics Lab's online messaging groups. The goal is to identify low-level themes of each message.
The research question is: How did Physics Lab's online community emerge?
If the message does not belong to the conversation, generate "Skipped" as the theme.
Always follow the output format:
---
Thoughts: {Thoughts about the conversation. How are you going to code the data?}
Analysis:
{ID}. {Low-level themes of the message, focus on social interactions, seperated by commas}
Notes: {Note about the conversation. What did you find from the data?}`.trim(),
            Messages.map((Message, Index) => `${Index + 1}. ${BuildMessagePrompt(Message)}`).join("\n")];
    }
}