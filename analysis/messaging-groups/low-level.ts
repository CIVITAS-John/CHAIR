import { CodedThread, Conversation, Message } from '../../utils/schema.js';
import { ConversationAnalyzer } from './conversations.js';

/** LowLevelAnalyzerBase: Conduct the first-round low-level coding of the conversations. */
// Authored by John Chen.
export abstract class LowLevelAnalyzerBase extends ConversationAnalyzer {
    /** GetChunkSize: Get the chunk size and cursor movement for the LLM. */
    // Return value: [Chunk size, Cursor movement]
    public GetChunkSize(Recommended: number, Remaining: number) {
        return Recommended;
    }
    /** ParseResponse: Parse the responses from the LLM. */
    public ParseResponse(Analysis: CodedThread, Lines: string[], Messages: Message[], ChunkStart: number): Record<number, string> {
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