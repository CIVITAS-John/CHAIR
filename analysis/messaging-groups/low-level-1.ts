import { CodedThread, Conversation, Message } from '../../utils/schema';
import { Analyzer } from '../analyzer.js';
import { BuildMessagePrompt } from './conversations.js';

/** LowLevelAnalyzer1: Conduct the first-round low-level coding of the conversations. */
// Authored by John Chen.
export class LowLevelAnalyzer1 extends Analyzer<Conversation> {
    /** Name: The name of the analyzer. */
    public Name: string = "low-level-1";
    /** GetChunkSize: Get the chunk size and cursor movement for the LLM. */
    // Return value: [Chunk size, Cursor movement]
    public GetChunkSize(Recommended: number, Remaining: number) {
        return Recommended;
    }
    /** BuildPrompts: Build the prompts for the LLM. */
    public BuildPrompts(Target: Conversation, Analysis: CodedThread, Messages: Message[], ChunkStart: number, LastChunk: boolean): [string, string] {
        return [`
You are an expert in thematic analysis. Now, you are working on the open coding.
This conversation comes from Physics Lab's online messaging groups. The goal is to identify low-level tags of each message with a focus on social interactions.
The research question is: How did Physics Lab's online community emerge?
Always follow the output format:
---
Thoughts: {Thoughts and plans about analyzing the conversation}
Analysis:
1. tag1, tag2
2. tag3, tag4
(Repeat for all messages)
Summary: {Summary of the entire conversation}
Notes: {Summary and specific notes about the entire conversation}`.trim(),
            Messages.map((Message, Index) => `${Index + 1}. ${BuildMessagePrompt(Message)}`).join("\n")];
    }
    /** ParseResponse: Parse the responses from the LLM. */
    public ParseResponse(Lines: string[], Analysis: CodedThread, Messages: Message[], ChunkStart: number, LastChunk: boolean): Record<number, string> {
        var Results: Record<number, string> = {};
        for (var I = 0; I < Lines.length; I++) {
            var Line = Lines[I];
            if (Line.startsWith("Thoughts:")) 
                Analysis.Plan = Line.substring(9).trim(); 
            else if (Line.startsWith("Summary:")) 
                Analysis.Summary = Line.substring(8).trim(); 
            else if (Line.startsWith("Notes:")) 
                Analysis.Reflection = Line.substring(6).trim(); 
            else {
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