import { Code, CodedThread, Message } from '../../utils/schema.js';
import { ConversationAnalyzer } from './conversations.js';

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
                    // Sometimes the LLM will return "Example quote 1: quote"
                    Line = Line.replace(/^(Example quote \d+):/, "").trim();
                    // Sometimes the LLM will return "P{number}: {codes}"
                    Line = Line.replace(/^(P(\d+)|Designer|tag(\d+))\:/, "").trim();
                    // Sometimes the LLM will return `"quote" (Author)`
                    Line = Line.replace(/^\"(.*)\"/, "$1").trim();
                    // Sometimes the LLM will return `**{code}**`
                    Line = Line.replace(/^\*\*(.*)\*\*/, "$1").trim();
                    // Add the example if it is not already in the list
                    CurrentCode.Examples = CurrentCode.Examples ?? [];
                    if (!CurrentCode.Examples.includes(Line))
                        CurrentCode.Examples.push(Line);
                }
            }
        }
        // Remove the "..." code
        delete Analysis.Codes["..."];
        // This analyzer does not conduct item-level coding.
        return 0;
    }
}