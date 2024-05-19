import { ResearchQuestion } from "../../constants.js";
import { Codebook, Code } from "../../utils/schema.js";
import { UpdateCodes } from "./codebooks.js";
import { CodeConsolidator } from "./consolidator.js";

/** DefinitionParse: Parse generated definitions based on labels and quotes. */
export abstract class DefinitionParser extends CodeConsolidator {
    /** Constructor: Create a new DefinitionParser. */
    constructor() {
        super();
        this.Chunkified = true;
    }
    /** ParseResponse: Parse the response for the code consolidator. */
    public async ParseResponse(Codebook: Codebook, Codes: Code[], Lines: string[]) {
        var Pendings: Code[] = [];
        var CurrentCode: Code | undefined;
        var Status = "";
        // Parse the definitions
        for (var I = 0; I < Lines.length; I++) {
            var Line = Lines[I];
            if (Line == "" || Line.startsWith("---")) continue;
            // Sometimes, LLMs will do **(...)** for anything. We need to remove that.
            Line = Line.replace(/\*\*/g, "");
            // If we see "...", that means later codes are not processed and should be truncated
            if (Line == "...") break;
            var Match = Line.match(/^(\d+)\./);
            if (Match) {
                // Sometimes, the label is merged with the number
                CurrentCode = { Label: Line.substring(Match[0].length).trim().toLowerCase(), Definitions: [], Categories: [], Examples: [], Alternatives: [] };
                Pendings.push(CurrentCode);
            } else if (Line.startsWith("Label:") && CurrentCode) {
                CurrentCode.Label = Line.substring(6).trim().toLowerCase();
                Status = "Label";
            } else if (Line.startsWith("Criteria:") && CurrentCode) {
                var Definition = Line.substring(9).trim();
                if (Definition !== "")
                    CurrentCode.Definitions = [Definition];
                Status = "Criteria";
            } else if (Line.startsWith("Category:") && CurrentCode) {
                var Category = Line.substring(9).trim();
                if (Category !== "")
                    CurrentCode.Categories = [Category.toLowerCase()];
                Status = "Category";
            } else if (Status == "Label") {
                CurrentCode!.Label = `${CurrentCode!.Label}\n${Line}`.trim();
            } else if (Status == "Criteria") {
                CurrentCode!.Definitions!.push(Line.trim());
            } else if (Status == "Theme") {
                // Sometimes, the theme ends with a "."
                if (Line.endsWith(".")) Line = Line.substring(0, Line.length - 1).trim();
                CurrentCode!.Categories!.push(Line.trim());
            }
        }
        // Check if we have all the codes and avoid mismatches
        for (var I = 0; I < Pendings.length; I++) {
            var NewCode = Pendings[I];
            // Sometimes, the new label starts with "label:"
            if (NewCode.Label.startsWith("label:")) NewCode.Label = NewCode.Label.substring(6).trim();
            // Sometimes, the order of labels is wrong (! found for gpt-3.5-turbo)
            var Found = Codes.findIndex(Code => Code.Label == NewCode.Label);
            if (Found != -1 && Found !== I) 
                throw new Error(`Invalid response: code ${NewCode.Label}'s mapping order is wrong.`);
        }
        // Update the codes
        UpdateCodes(Codebook, Pendings, Codes);
        // Remove temp labels
        Codes.forEach(Code => delete Code.OldLabels);
        // Return the cursor movement
        return Object.keys(Pendings).length - Codes.length;
    }
}

/** DefinitionGenerator: Generate definitions based on labels and quotes. */
export class DefinitionGenerator extends DefinitionParser {
    /** SubunitFilter: Filter the subunits before chunking. */
    public SubunitFilter(Code: Code): boolean {
        // Only when the code has no definitions should we generate them
        return super.SubunitFilter(Code) && (Code.Definitions?.length ?? 0) == 0;
    }
    /** BuildPrompts: Build the prompts for the code consolidator. */
    public async BuildPrompts(Codebook: Codebook, Codes: Code[]): Promise<[string, string]>{
        // Generate definitions for codes
        return [`
You are an expert in thematic analysis clarifying the criteria of qualitative codes. Quotes are independent of each other. Do not attempt to merge codes now.
Write clear and generalizable criteria for each code, informed by the context, and without unnecessary specifics or examples.
If necessary, refine labels to keep contexts, but do not repeat yourself.
Group each code into a theory-informed category. Use 2-4 words for categories to provide general contexts.
${ResearchQuestion}
Always follow the output format:
---
Thoughts: 
* {Name some categories you identified from the research question and theoretical lens}

Definitions for each code (${Codes.length} in total):
1. 
Criteria: {A sentence of criteria 1}
Label: {A label of code 1}
Category: {2-4 words for code 1}
...
${Codes.length}.
Criteria: {A sentence of criteria ${Codes.length}}
Label: {A label of code ${Codes.length}}
Category: {2-4 words for code ${Codes.length}}
---`.trim(), 
            Codes.map((Code, Index) => `
${Index + 1}.
Label: ${Code.Label}
Quotes:
${Code.Examples?.sort((A, B) => B.length - A.length).slice(0, 3).map(Example => `- ${Example}`).join("\n")}`.trim()).join("\n\n")];
    }
}