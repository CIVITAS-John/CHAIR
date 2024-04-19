import { CodedThread, Conversation, Message } from '../../utils/schema';
import { Analyzer } from '../analyzer.js';
import { BuildMessagePrompt } from './conversations.js';

/** LowLevelAnalyzer2: Conduct the first-round low-level coding of the conversations. */
// Change from LowLevelAnalyzer1: We try to get the LLMs look from multiple angles and give more tags. Also, the temperature is raised.
// Authored by John Chen.
export class LowLevelAnalyzer2 extends Analyzer<Conversation> {
    /** Name: The name of the analyzer. */
    public Name: string = "low-level-2";
    /** BaseTemperature: The base temperature for the LLM. */
    public BaseTemperature: number = 0.5;
    /** GetChunkSize: Get the chunk size and cursor movement for the LLM. */
    // Return value: [Chunk size, Cursor movement]
    public GetChunkSize(Recommended: number, Remaining: number) {
        return Recommended;
    }
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
                    Codes = Codes.replace(/^(P(\d+)|Designer|tag(\d+))\:/, "").trim();
                    // Sometimes the LLM will return "{codes}"
                    if (Codes.startsWith("{") && Codes.endsWith("}")) Codes = Codes.substring(1, Codes.length - 1);
                    // Sometimes the LLM will start with the original content
                    var Message = Messages[parseInt(Match[1]) - 1];
                    if (Codes.toLowerCase().startsWith(Message.Content.toLowerCase())) Codes = Codes.substring(Message.Content.length).trim();
                    // Sometimes the LLM will return "- tags: {codes}"
                    if (Codes.startsWith("- tags:")) Codes = Codes.substring(7).trim();
                    // Sometimes the LLM will return "- {codes}"
                    if (Codes.startsWith("-")) Codes = Codes.substring(1).trim();
                    Results[parseInt(Match[1])] = Codes.replaceAll("-", " ");
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