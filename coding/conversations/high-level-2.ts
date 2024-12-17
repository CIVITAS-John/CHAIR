import { CodingNotes, ResearchQuestion } from "../../constants.js";
import type { CodedThread, Conversation, Message } from "../../utils/schema.js";

import { BuildMessagePrompt } from "./conversations.js";
import { HighLevelAnalyzerBase } from "./high-level.js";

/** HighLevelAnalyzer2: Conduct the first-round high-level coding of the conversations. */
/* Original prompt format:
Hi ChatGPT, I want to analyze the following interaction between an instructor and some students:
[DATA]
Please give me a codebook to analyze the instructional methodologies and the sentiment within this interaction.
---
Barany et al. (2024) ChatGPT for Education Research: Exploring the Potential of Large Language Models for Qualitative Codebook Development
---
However, the original prompt does not give examples as documented by the paper. We modified the prompt to make that happen.
Changes from HighLevelAnalyzer1: We mentioned fields in the prompt and added a planning stage.
Adapter: John Chen
*/
export default class HighLevelAnalyzer2 extends HighLevelAnalyzerBase {
    /** Name: The name of the analyzer. */
    public Name = "high-level-2";
    /** BaseTemperature: The base temperature for the LLM. */
    public BaseTemperature = 0.5;
    /** BuildPrompts: Build the prompts for the LLM. */
    public BuildPrompts(_Analysis: CodedThread, _Target: Conversation, Messages: Message[], _ChunkStart: number): Promise<[string, string]> {
        return Promise.resolve([
            `
Hi ChatGPT, I want to analyze the following interaction in one of Physics Lab's online message groups.
Please give me a codebook to analyze factors within this interaction that could contribute to the research.
${ResearchQuestion}
${CodingNotes}
For each code, try to find 3 quotes. Always follow the output format:
---
* Summary
{A summary of the conversation}

* Plan
{A paragraph of plans and guiding questions about analyzing the conversation from multiple theoretical angles}

# Label of category 1
## Label of code 1
Definition: A definition of code 1
- "Example quote 1"
- "Example quote 2"

## ...
# ...
`.trim(),
            Messages.map((Message, Index) => `${Index + 1}. ${BuildMessagePrompt(Message)}`).join("\n"),
        ]);
    }
}
