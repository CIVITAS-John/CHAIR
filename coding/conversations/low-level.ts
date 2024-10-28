import { GetSpeakerName } from "../../constants.js";
import { MaxItems } from "../../utils/llms.js";
import { CodedThread, Message } from "../../utils/schema.js";
import { ConversationAnalyzer } from "./conversations.js";

/** LowLevelAnalyzerBase: Conduct the first-round low-level coding of the conversations. */
// Authored by John Chen.
export abstract class LowLevelAnalyzerBase extends ConversationAnalyzer {
    /** TagName: How do we call a tag in the prompt. */
    protected TagName: string = "tag";
    /** TagsName: How do we call tags in the prompt. */
    protected TagsName: string = "tags";
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
            var NextLine = I + 1 < Lines.length ? Lines[I + 1] : "";
            if (Line.startsWith("**") && Line.endsWith("**"))
                Line = Line.substring(2, Line.length - 2).trim();
            if (Line.startsWith("Thoughts:")) {
                Analysis.Plan = Line.substring(9).trim();
                if (Analysis.Plan == "")
                    Analysis.Plan = Lines.slice(I + 1)
                        .join("\n")
                        .trim();
            } else if (Line.startsWith("Summary:")) {
                Analysis.Summary = Line.substring(8).trim();
                if (Analysis.Summary == "")
                    Analysis.Summary = Lines.slice(I + 1)
                        .join("\n")
                        .trim();
            } else if (Line.startsWith("Notes:")) {
                Analysis.Reflection = Line.substring(6).trim();
                if (Analysis.Reflection == "")
                    Analysis.Reflection = Lines.slice(I + 1)
                        .join("\n")
                        .trim();
            } else {
                var Match = Line.match(/^(\d+)\. (.*)$/);
                if (Match) {
                    var Message = Messages[parseInt(Match[1]) - 1];
                    if (!Message) continue;
                    var Codes = Match[2].trim();
                    // Sometimes, the LLM will return the message content and put the codes in the next line
                    if (NextLine != "" && !NextLine.startsWith("Summary:") && !NextLine.match(/^(\d+)\. (.*)$/)) {
                        Codes = NextLine.trim();
                        I++;
                    }
                    // For images, force the tag "Image sharing"
                    if (Message.Content == "[Image]") Codes = "Image Sharing";
                    // For emoji, force the tag "Emoji"
                    if (Message.Content == "[Emoji]") Codes = "Emoji";
                    // For checkin, force the tag "Checkin"
                    if (Message.Content == "[Checkin]") Codes = "Checkin";
                    // Remove the () part
                    Codes = Codes.replace(/\(.*?\)/, "").trim();
                    // Sometimes the LLM will return "tag{number}: {codes}"
                    Codes = Codes.replace(new RegExp(`^${this.TagName}(\d+)\:`), "").trim();
                    // Sometimes the LLM will put the message back
                    if (Codes.startsWith(Message.Content)) Codes = Codes.substring(Message.Content.length).trim();
                    // Sometimes the LLM will return "{codes}, {codes}"
                    Codes = Codes.replace(/\{(.*?)\}/, "$1").trim();
                    // Sometimes the LLM will start with the original content
                    if (Codes.toLowerCase().startsWith(Message.Content.toLowerCase())) Codes = Codes.substring(Message.Content.length).trim();
                    // Sometimes the LLM will return "- tags: {codes}"
                    if (Codes.startsWith(`- ${this.TagsName}:`)) Codes = Codes.substring(7).trim();
                    // Sometimes the LLM will return "- {codes}"
                    if (Codes.startsWith("-")) Codes = Codes.substring(1).trim();
                    // Sometimes the LLM will return "{codes}."
                    if (Codes.endsWith(".")) Codes = Codes.substring(0, Codes.length - 1).trim();
                    // Sometimes the LLM will return "preliminary tags: {codes}"
                    if (Codes.toLowerCase().startsWith(`preliminary ${this.TagsName}:`)) Codes = Codes.substring(17).trim();
                    // Sometimes the LLM will return codes such as AcknowledgingResponse, which should be split into two words
                    Codes = Codes.replace(/((?<=[a-z][a-z])[A-Z]|[A-Z](?=[a-z]))/g, " $1").trim();
                    // Sometimes the LLM will use -_ to separate words
                    Codes = Codes.replaceAll("-", " ");
                    Codes = Codes.replaceAll("_", " ");
                    // Sometimes the LLM will generate multiple spaces
                    Codes = Codes.replaceAll(/\s+/g, " ");
                    // Sometimes the LLM will return "{speaker}, {other codes}"
                    var Speaker = GetSpeakerName(Message.UserID).toLowerCase();
                    if (Speaker.includes("-")) Speaker = Speaker.substring(0, Speaker.indexOf("-")).trim();
                    Codes = Codes.replace(new RegExp(`^${Speaker} *\\d*(;|:|$)`, "i"), "").trim();
                    // Sometimes the LLM will return "{code}: {explanation}
                    if (Codes.match(/^[\w ]+\: /)) Codes = Codes.substring(0, Codes.indexOf(":")).trim();
                    Results[parseInt(Match[1])] = Codes;
                }
            }
        }
        if (Object.values(Results).every((Value) => Value == "")) throw new Error(`Invalid response: all codes are empty.`);
        if (Analysis.Plan == undefined) throw new Error(`Invalid response: no plans`);
        if (Analysis.Reflection == undefined) throw new Error(`Invalid response: no reflections`);
        if (Analysis.Summary == undefined) throw new Error(`Invalid response: no summary`);
        if (Object.keys(Results).length != Messages.length)
            throw new Error(`Invalid response: ${Object.keys(Results).length} results for ${Messages.length} messages.`);
        // Check keys
        //for (var I = 0; I < Object.keys(Results).length; I++)
        //    if (!Results[I + 1]) throw new Error(`Invalid response: missing message ${I + 1}`);
        return Results;
    }
}
