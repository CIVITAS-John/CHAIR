import { CodedThread, Conversation, Message } from '../../utils/schema';
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
However, the original prompt does not give examples as documented by the paper.
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
- Code 1: Definition of the code
  - Example quote 1
  - Example quote 2
  - Example quote 3
`.trim(),
            Messages.map((Message, Index) => `${Index + 1}. ${BuildMessagePrompt(Message)}`).join("\n")];
    }
    /** ParseResponse: Parse the responses from the LLM. */
    public ParseResponse(Lines: string[], Analysis: CodedThread, Messages: Message[], ChunkStart: number): Record<number, string> {
        var Results: Record<number, string> = {};
        for (var I = 0; I < Lines.length; I++) {
            var Line = Lines[I];
            if (Line.startsWith("Thoughts:")) 
                Analysis.Plan = Line.substring(9).trim(); 
            else if (Line.startsWith("Summary:")) 
                Analysis.Summary = Line.substring(8).trim(); 
            else if (Line.startsWith("Notes:")) {
                Analysis.Reflection = Line.substring(6).trim(); 
                if (Analysis.Reflection == "") 
                    Analysis.Reflection = Lines.slice(I + 1).join("\n").trim();
            } else {
                var Match = Line.match(/^(\d+)\. (.*)$/);
                if (Match) {
                    var Codes = Match[2].trim().replaceAll("_", " ");
                    // Sometimes the LLM will return "P{number}: {codes}"
                    Codes = Codes.replace(/^(P(\d+)|Designer)\:/, "").trim();
                    // Sometimes the LLM will return "{codes}"
                    if (Codes.startsWith("{") && Codes.endsWith("}")) Codes = Codes.substring(1, Codes.length - 1);
                    // Sometimes the LLM will start with the original content
                    var Message = Messages[parseInt(Match[1]) - 1];
                    if (Codes.toLowerCase().startsWith(Message.Content.toLowerCase())) Codes = Codes.substring(Message.Content.length).trim();
                    // Sometimes the LLM will return "- tags: {codes}"
                    if (Codes.startsWith("- tags:")) Codes = Codes.substring(7).trim();
                    // Sometimes the LLM will return "- {codes}"
                    if (Codes.startsWith("-")) Codes = Codes.substring(1).trim();
                    Results[parseInt(Match[1])] = Codes;
                }
            }
        }
        if (Analysis.Plan == undefined) throw new Error(`Invalid response: no plans`);
        if (Analysis.Reflection == undefined) throw new Error(`Invalid response: no reflections`);
        if (Analysis.Summary == undefined) throw new Error(`Invalid response: no summary`);
        if (Object.keys(Results).length != Messages.length) 
            throw new Error(`Invalid response: ${Object.keys(Results).length} results for ${Messages.length} inputs`);
        return Results;
    }
}