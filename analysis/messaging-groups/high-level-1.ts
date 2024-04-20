import { Code, CodedThread, Conversation, Message } from '../../utils/schema.js';
import { BuildMessagePrompt, ConversationAnalyzer } from './conversations.js';

/** HighLevelAnalyzer1: Conduct the first-round high-level coding of the conversations. */
/* Original prompt format:
Hi ChatGPT, I want to analyze the following interaction between an instructor and some students:
[DATA]
Please give me a codebook to analyze the instructional methodologies and the sentiment within this interaction.
---
Barany et al. (2024) ChatGPT for Education Research: Exploring the Potential of Large Language Models for Qualitative Codebook Development
---
However, the original prompt does not give examples as documented by the paper. We modified the prompt to make that happen.
Adapter: John Chen
*/
export class HighLevelAnalyzer1 extends ConversationAnalyzer {
    /** Name: The name of the analyzer. */
    public Name: string = "high-level-1";
    /** BaseTemperature: The base temperature for the LLM. */
    public BaseTemperature: number = 0.5;
    /** GetChunkSize: Get the chunk size and cursor movement for the LLM. */
    // Return value: [Chunk size, Cursor movement]
    public GetChunkSize(Recommended: number, Remaining: number) {
        return Remaining;
    }
    /** BuildPrompts: Build the prompts for the LLM. */
    public BuildPrompts(Analysis: CodedThread, Target: Conversation, Messages: Message[], ChunkStart: number): [string, string] {
        return [`
Hi ChatGPT, I want to analyze the following interaction in one of Physics Lab's online message groups.
Please give me a codebook to analyze factors within this interaction that could contribute to the community's emergence.
For each code, try to find 3 quotes. Always follow the output format:
---
# Label of category 1
## Label of code 1
Definition: A definition of code 1
- Example quote 1
- Example quote 2

## ...
# ...
`.trim(),
            Messages.map((Message, Index) => `${Index + 1}. ${BuildMessagePrompt(Message)}`).join("\n")];
    }
    /** ParseResponse: Parse the responses from the LLM. */
    public ParseResponse(Analysis: CodedThread, Lines: string[], Messages: Message[], ChunkStart: number): Record<number, string> {
        var Category = "[All]";
        var CurrentCode: Code | undefined;
        // Parse the response
        for (var I = 0; I < Lines.length; I++) {
            var Line = Lines[I];
            if (Line.startsWith("# ")) {
                Category = Line.substring(2).trim();
            } else if (Line.startsWith("## ")) {
                Line = Line.substring(3).trim();
                // Sometimes, the LLM will return "P{number}" as the name of the code
                if (Line.match(/^(P(\d+)|Designer)$/)) throw new Error(`Invalid code name: ${Line}.`);
                // Get or create the code
                Line = Line.toLowerCase();
                CurrentCode = Analysis.Codes[Line] ?? { Categories: [Category], Label: Line };
                Analysis.Codes[Line] = CurrentCode;
            } else if (Line.startsWith("Definition: ")) {
                // Add the definition to the current code
                if (CurrentCode) {
                    Line = Line.substring(12).trim();
                    CurrentCode!.Definitions = [Line];
                }
            } else if (Line.startsWith("- ")) {
                // Add examples to the current code
                if (CurrentCode) {
                    Line = Line.substring(2).trim();
                    // Sometimes the LLM will return "P{number}: {codes}"
                    Line = Line.replace(/^(P(\d+)|Designer|tag(\d+))\:/, "").trim();
                    // Sometimes the LLM will return `"quote" (Author)`
                    Line = Line.replace(/^\"(.*)\"/, "$1");
                    // Add the example if it is not already in the list
                    CurrentCode.Examples = CurrentCode.Examples ?? [];
                    if (!CurrentCode.Examples.includes(Line))
                        CurrentCode.Examples.push(Line);
                }
            }
        }
        // This analyzer does not conduct item-level coding.
        return {};
    }
}