import { MaxItems } from '../../utils/llms.js';
import { CodedThread, Message } from '../../utils/schema.js';
import { ConversationAnalyzer } from './conversations.js';

/** LowLevelAnalyzerBase: Conduct the first-round low-level coding of the conversations. */
// Authored by John Chen.
export abstract class LowLevelAnalyzerBase extends ConversationAnalyzer {
    /** GetChunkSize: Get the chunk size and cursor movement for the LLM. */
    // We will fetch at least 10 messages for each batch to keep the context.
    public GetChunkSize(Recommended: number, Remaining: number, Iteration: number, Tries: number): [number, number, number] {
        // For weaker models, we will reduce the chunk size (32 => 24 => 16 => 8)
        if (Recommended == MaxItems) return [Recommended - Tries * 8, 0, 0];
        return [Recommended - Tries * 2, Math.max(8 - Recommended - Tries, 0), 0];
    }
    /** ParseResponse: Parse the responses from the LLM. */
    public async ParseResponse(Analysis: CodedThread, Lines: string[], Messages: Message[], ChunkStart: number): Promise<Record<number, string>> {
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
                    var Message = Messages[parseInt(Match[1]) - 1];
                    var Codes = Match[2].trim().replaceAll("_", " ");
                    // For images, force the tag "Image sharing"
                    if (Message.Content == "[Image]") Codes = "Image Sharing";
                    // For emoji, force the tag "Emoji"
                    if (Message.Content == "[Emoji]") Codes = "Emoji";
                    // For checkin, force the tag "Checkin"
                    if (Message.Content == "[Checkin]") Codes = "Checkin";
                    // Remove the () part
                    Codes = Codes.replace(/\(.*?\)/, "").trim();
                    // Sometimes the LLM will return "P{number}: {codes}"
                    Codes = Codes.replace(/^(P(\d+)|Designer|tag(\d+))\:/, "").trim();
                    // Sometimes the LLM will return "{codes}"
                    if (Codes.startsWith("{") && Codes.endsWith("}")) Codes = Codes.substring(1, Codes.length - 1);
                    // Sometimes the LLM will start with the original content
                    if (Codes.toLowerCase().startsWith(Message.Content.toLowerCase())) Codes = Codes.substring(Message.Content.length).trim();
                    // Sometimes the LLM will return "- tags: {codes}"
                    if (Codes.startsWith("- tags:")) Codes = Codes.substring(7).trim();
                    // Sometimes the LLM will return "- {codes}"
                    if (Codes.startsWith("-")) Codes = Codes.substring(1).trim();
                    // Sometimes the LLM will return codes such as AcknowledgingResponse, which should be split into two words
                    Codes = Codes.replace(/((?<=[a-z][a-z])[A-Z]|[A-Z](?=[a-z]))/g, " $1").trim();
                    // Sometimes the LLM will use - to separate words
                    Codes = Codes.replaceAll("-", " ")
                    // Sometimes the LLM will generate multiple spaces
                    Codes = Codes.replaceAll(/\s+/g, " ");
                    // Sometimes the LLM will return "{code}: {explanation}
                    if (Codes.match(/^[\w ]+\: /)) Codes = Codes.substring(0, Codes.indexOf(":")).trim();
                    Results[parseInt(Match[1])] = Codes;
                }
            }
        }
        if (Analysis.Plan == undefined) throw new Error(`Invalid response: no plans`);
        if (Analysis.Reflection == undefined) throw new Error(`Invalid response: no reflections`);
        if (Analysis.Summary == undefined) throw new Error(`Invalid response: no summary`);
        if (Object.keys(Results).length != Messages.length) throw new Error(`Invalid response: ${Object.keys(Results).length} results for ${Messages.length} messages.`);
        // Check keys
        //for (var I = 0; I < Object.keys(Results).length; I++)
        //    if (!Results[I + 1]) throw new Error(`Invalid response: missing message ${I + 1}`);
        return Results;
    }
}