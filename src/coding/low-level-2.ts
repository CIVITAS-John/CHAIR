import type { CodedThread, Conversation, Message } from "../schema.js";

import { buildMessagePrompt } from "./conversations.js";
import { LowLevelAnalyzerBase } from "./low-level.js";

/**
 * Conduct the first-round low-level coding of the conversations.
 * Change from LowLevelAnalyzer1: We try to get the LLMs look from multiple angles and give more tags. Also, the temperature is raised.
 * @author John Chen
 */
export default class LowLevelAnalyzer2 extends LowLevelAnalyzerBase {
    /** The name of the analyzer. */
    override name = "low-level-2";
    /** The base temperature for the LLM. */
    override baseTemperature = 0.5;

    /** Build the prompts for the LLM. */
    override buildPrompts(
        _analysis: CodedThread,
        _target: Conversation,
        messages: Message[],
        _chunkStart: number,
    ): Promise<[string, string]> {
        return Promise.resolve([
            `
You are an expert in thematic analysis. Now, you are working on the open coding.
This conversation comes from Physics Lab's online messaging groups. The goal is to identify multiple low-level tags of each message with a focus on social interactions.
The research question is: How did Physics Lab's online community emerge?
Always follow the output format:
---
Thoughts: {Thoughts and plans about analyzing the conversation from different angles.}
Analysis for all ${messages.length} messages:
1. tag1; tag2; tag3; ...
...
${messages.length}. tag4; tag5; tag6; ...
Summary: {Summary of the entire conversation}
Notes: {Summary and specific notes about the entire conversation}`.trim(),
            messages
                .map((message, idx) => `${idx + 1}. ${buildMessagePrompt(this.dataset, message)}`)
                .join("\n"),
        ]);
    }
}
