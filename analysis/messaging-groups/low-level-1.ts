import { CodedThread, Conversation, Message } from '../../utils/schema';
import { Analyzer } from '../analyzer.js';
import { BuildMessagePrompt } from './conversations.js';

/** LowLevelAnalyzer1: Conduct the first-round low-level coding of the conversations. */
// Authored by John Chen.
export class LowLevelAnalyzer1 implements Analyzer<Conversation> {
    /** Name: The name of the analyzer. */
    public Name: string = "low-level-1";
    /** BuildPrompts: Build the prompts for the LLM. */
    public BuildPrompts(Target: Conversation, Analysis: CodedThread, Messages: Message[], LastChunk: boolean): [string, string] {
        return [`
You are an expert in thematic analysis. Now, you are working on the open coding.
This conversation comes from Physics Lab's online messaging groups. The goal is to identify low-level tags of each message.
The research question is: How did Physics Lab's online community emerge?
Always follow the output format:
---
Thoughts: {Thoughts and plans about analyzing the conversation}
Messages:
{ID}. {Low-level tags of this message, focus on social interactions, seperated by commas|Skipped}
Summary: {Summary of the entire conversation}
Notes: {Summary and specific notes about the entire conversation}`.trim(),
            Messages.map((Message, Index) => `${Index + 1}. ${BuildMessagePrompt(Message)}`).join("\n")];
    }
    /** ParseResponse: Parse the responses from the LLM. */
    public ParseResponse(Lines: string[], Analysis: CodedThread, Messages: Message[]): Record<number, string> {
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
                    var Codes = Match[2].trim();
                    // Sometimes the LLM will return "{codes}"
                    if (Codes.startsWith("{") && Codes.endsWith("}")) Codes = Codes.substring(1, Codes.length - 1);
                    // Sometimes the LLM will return "P{number}: {codes}"
                    Codes = Codes.replace(/^(P(\d+)|Designer)\:/, "").trim();
                    // Sometimes the LLM will start with the original content
                    var Message = Messages[parseInt(Match[1]) - 1];
                    if (Codes.toLowerCase().startsWith(Message.Content.toLowerCase())) Codes = Codes.substring(Message.Content.length).trim();
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