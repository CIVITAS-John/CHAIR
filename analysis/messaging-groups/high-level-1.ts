import { Code, CodedThread, Conversation, Message } from '../../utils/schema';
import { Analyzer } from '../analyzer.js';
import { BuildMessagePrompt } from './conversations.js';

/** HighLevelAnalyzer1: Conduct the first-round high-level coding of the conversations. */
/* Original prompt format:
Hi ChatGPT, I want to analyze the following interaction between an instructor and some students:
[DATA]
Please give me a codebook to analyze the instructional methodologies and the sentiment within this interaction.
---
Barany et al. (2024) ChatGPT for Education Research: Exploring the Potential of Large Language Models for Qualitative Codebook Development
---
However, the original prompt does not give examples as documented by the paper. We modified the prompt to make that happen.
*/
export class HighLevelAnalyzer1 extends Analyzer<Conversation> {
    /** Name: The name of the analyzer. */
    public Name: string = "high-level-1";
    /** GetChunkSize: Get the chunk size and cursor movement for the LLM. */
    // Return value: [Chunk size, Cursor movement]
    public GetChunkSize(Recommended: number, Remaining: number) {
        return Remaining;
    }
    /** BuildPrompts: Build the prompts for the LLM. */
    public BuildPrompts(Target: Conversation, Analysis: CodedThread, Messages: Message[], ChunkStart: number): [string, string] {
        return [`
Hi ChatGPT, I want to analyze the following interaction in one of Physics Lab's online message groups.
Please give me a codebook to analyze factors within this interaction that could contribute to the community's emergence.
Always follow the output format:
---
## Category 1
- Name of code 1: Definition of code 1
  - Example quote 1
  - Example quote 2
  - Example quote 3
`.trim(),
            Messages.map((Message, Index) => `${Index + 1}. ${BuildMessagePrompt(Message)}`).join("\n")];
    }
    /** ParseResponse: Parse the responses from the LLM. */
    public ParseResponse(Lines: string[], Analysis: CodedThread, Messages: Message[], ChunkStart: number): Record<number, string> {
        var Category = "[All]";
        var CurrentCode: Code | undefined;
        // Parse the response
        for (var I = 0; I < Lines.length; I++) {
            var Line = Lines[I];
            if (Line.startsWith("## ")) {
                Category = Line.substring(2).trim();
            } else if (Line.startsWith("- ")) {
                Line = Line.substring(2).trim();
                var Match = Line.match(/^(.*?): (.*)$/);
                var Name = Match ? Match[1].trim() : Line;
                var Description = Match ? Match[2].trim() : undefined;
                // Get or create the code
                CurrentCode = Analysis.Codes[Name] ?? { Category: Category, Label: Name };
                if (Description) CurrentCode.Description = Description;
                Analysis.Codes[Name] = CurrentCode;
            } else if (Line.trim().startsWith("- ")) {
                // Add examples to the current code
                if (CurrentCode) {
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