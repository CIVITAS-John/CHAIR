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
Always follow the output format:
---
Thoughts: {Thoughts and plans about analyzing this conversation.}
Themes:
{ID}. {Low-level themes of the message, focus on social interactions, seperated by commas|Skipped}
Notes: {Summary and specific notes about this conversation.}`.trim(),
            Messages.map((Message, Index) => `${Index + 1}. ${BuildMessagePrompt(Message)}`).join("\n")];
    }
    /** ParseResponse: Parse the responses from the LLM. */
    public ParseResponse(Lines: string[], Analysis: CodedThread): Record<number, string> {
        var Results: Record<number, string> = {};
        for (var I = 0; I < Lines.length; I++) {
            var Line = Lines[I];
            if (Line.startsWith("Thoughts:")) 
                Analysis.Plan = Line.substring(9).trim(); 
            else if (Line.startsWith("Notes:")) 
                Analysis.Reflection = Line.substring(6).trim(); 
            else {
                var Match = Line.match(/^(\d+)\. (.*)$/);
                if (Match) Results[parseInt(Match[1])] = Match[2].trim();
            }
        }
        if (Analysis.Plan == undefined) throw new Error(`Invalid response: no plans`);
        if (Analysis.Reflection == undefined) throw new Error(`Invalid response: no reflections`);
        if (Object.keys(Results).length != Object.keys(Analysis.Items).length) 
            throw new Error(`Invalid response: ${Object.keys(Results).length} results for ${Object.keys(Analysis.Items).length} inputs`);
        return Results;
    }
}