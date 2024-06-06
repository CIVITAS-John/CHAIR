import { AssembleExampleFrom, Code, CodedThread, Message } from '../../utils/schema.js';
import { ConversationAnalyzer, RevertMessageFormat } from './conversations.js';

/** HighLevelAnalyzerBase: Conduct the first-round high-level coding of the conversations. */
// Authored by John Chen.
export abstract class HighLevelAnalyzerBase extends ConversationAnalyzer {
    /** GetChunkSize: Get the chunk size and cursor movement for the LLM. */
    // Return value: [Chunk size, Cursor movement]
    public GetChunkSize(Recommended: number, Remaining: number) {
        return Remaining;
    }
    /** ParseResponse: Parse the responses from the LLM. */
    public async ParseResponse(Analysis: CodedThread, Lines: string[], Messages: Message[], ChunkStart: number): Promise<number> {
        var Category = "";
        var Position = "";
        var CurrentCode: Code | undefined;
        // Parse the response
        for (var I = 0; I < Lines.length; I++) {
            var Line = Lines[I];
            if (Line.startsWith("* Summary")) {
                Analysis.Summary = Line.substring(9).trim();
                if (Analysis.Summary == "") Position = "Summary";
            } else if (Line.startsWith("* Plan")) {
                Analysis.Plan = Line.substring(8).trim();
                if (Analysis.Plan == "") Position = "Plan";
            } else if (Line.startsWith("# ")) {
                Position = "";
                Category = Line.substring(2).trim();
            } else if (Line.startsWith("## ")) {
                Position = "";
                Line = Line.substring(3).trim();
                // Sometimes, the LLM will return "P{number}" as the name of the code
                if (Line.match(/^(P(\d+))($|\:)/)) throw new Error(`Invalid code name: ${Line}.`);
                // Sometimes, the LLM will return "**{code}**" as the name of the code
                Line = Line.replace(/^\*\*(.*)\*\*/, "$1").trim();
                // Sometimes, the LLM will return "1. {code}" as the name of the code
                Line = Line.replace(/^\d+\.*/, "").trim();
                // Sometimes, the LLM will return "Label: {code}" as the name of the code
                Line = Line.replace(/^(Label|Code)\s*\d*\:/, "").trim();
                // Get or create the code
                Line = Line.toLowerCase();
                CurrentCode = Analysis.Codes[Line] ?? { Categories: [Category.toLowerCase()], Label: Line };
                Analysis.Codes[Line] = CurrentCode;
            } else if (Line.startsWith("Definition: ")) {
                // Add the definition to the current code
                if (CurrentCode) {
                    Line = Line.substring(12).trim();
                    CurrentCode!.Definitions = [Line];
                }
            } else if (Position == "Summary") {
                Analysis.Summary = (Analysis.Summary + "\n" + Line.trim()).trim();
            } else if (Position == "Plan") {
                Analysis.Plan = (Analysis.Plan + "\n" + Line.trim()).trim();
            } else if (Line.startsWith("- ")) {
                // Add examples to the current code
                if (CurrentCode) {
                    Line = Line.substring(2).trim();
                    // Find the format (ID: 123)
                    var Index = Line.lastIndexOf("(ID:");
                    if (Index != -1) {
                        var ID = parseInt(Line.substring(Index + 4, Line.length - 1));
                        Line = Line.substring(0, Index).trim();
                        Index = ID;
                    }
                    // Sometimes the LLM will return "Example quote 1: quote"
                    Line = Line.replace(/^(Example quote \d+):/, "").trim();
                    // Sometimes the LLM will return "tag{number}: {codes}"
                    Line = Line.replace(/^tag(\d+)\:/, "").trim();
                    // Sometimes the LLM will return `"quote" (Author)`
                    Line = Line.replace(/^\"(.*)\"/, "$1").trim();
                    // Sometimes the LLM will return `quote (Author)`
                    Line = Line.replace(/^(.*)\(.+\)$/, "$1").trim();
                    // Sometimes the LLM will return `**{quote}**`
                    Line = Line.replace(/^\*\*(.*)\*\*/, "$1").trim();
                    // Sometimes the LLM will return `User/Designer-\d+: {quote}`
                    Line = Line.replace(/^(User|Designer)\-\d+\:/, "").trim();
                    // Revert the image and checkin tags
                    Line = RevertMessageFormat(Line);
                    // Add the example if it is not already in the list
                    CurrentCode.Examples = CurrentCode.Examples ?? [];
                    var Message = Messages.find(Message => Message.Content == Line);
                    if (!Message) {
                        var LowerLine = Line.toLowerCase();
                        // Remove everything after "..."
                        var Index = LowerLine.indexOf("...");
                        if (Index != -1) LowerLine = LowerLine.substring(0, Index).trim();
                        if (LowerLine.endsWith(".")) LowerLine = LowerLine.substring(0, LowerLine.length - 1);
                        Message = Messages.find(Message => {
                            var Lower = Message.Content.toLowerCase();
                            return Lower.includes(LowerLine) || LowerLine.includes(Lower);
                        });
                    }
                    if (!Message) console.log(`Cannot find message for: ${Line}`);
                    var Example = Message ? AssembleExampleFrom(Message) : Line;
                    if (Message && !CurrentCode.Examples.includes(Example))
                        CurrentCode.Examples.push(Example);
                }
            }
        }
        // Remove the "..." code
        delete Analysis.Codes["..."];
        // This analyzer does not conduct item-level coding.
        return 0;
    }
}