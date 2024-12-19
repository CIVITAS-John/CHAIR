import { ResearchQuestion } from "../constants.js";
import type { Code, Codebook } from "../utils/schema.js";

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
        const Pendings: Code[] = [];
        let CurrentCode: Code | undefined;
        let Status = "";
        // Parse the definitions
        for (var I = 0; I < Lines.length; I++) {
            let Line = Lines[I];
            if (Line == "" || Line.startsWith("---")) {
                continue;
            }
            // Sometimes, LLMs will do **(...)** for anything. We need to remove that.
            Line = Line.replace(/\*\*/g, "");
            // If we see "...", that means later codes are not processed and should be truncated
            if (Line == "...") {
                break;
            }
            const Match = /^(\d+)\./.exec(Line);
            if (Match) {
                Line = Line.substring(Match[0].length).trim();
                // Sometimes, the label is merged with the number
                CurrentCode = { Label: Line.trim().toLowerCase(), Definitions: [], Categories: [], Examples: [], Alternatives: [] };
                Pendings.push(CurrentCode);
                Status = "";
            }
            if (Line.startsWith("Label:") && CurrentCode) {
                CurrentCode.Label = Line.substring(6).trim().toLowerCase();
                Status = "Label";
            } else if (Line.startsWith("Phrase:") && CurrentCode) {
                CurrentCode.Label = Line.substring(7).trim().toLowerCase();
                Status = "Label";
            } else if (Line.startsWith("Criteria:") && CurrentCode) {
                const Definition = Line.substring(9).trim();
                if (Definition !== "") {
                    CurrentCode.Definitions = [Definition];
                }
                Status = "Criteria";
            } else if (Line.startsWith("Category:") && CurrentCode) {
                const Category = Line.substring(9).trim();
                if (Category !== "") {
                    CurrentCode.Categories = [Category.toLowerCase()];
                }
                Status = "Category";
            } else if (Status == "Label") {
                CurrentCode!.Label = `${CurrentCode!.Label}\n${Line}`.trim();
            } else if (Status == "Criteria") {
                CurrentCode!.Definitions!.push(Line.trim());
            } else if (Status == "Theme") {
                // Sometimes, the theme ends with a "."
                if (Line.endsWith(".")) {
                    Line = Line.substring(0, Line.length - 1).trim();
                }
                CurrentCode!.Categories!.push(Line.trim());
            }
        }
        // Check if we have all the codes and avoid mismatches
        for (var I = 0; I < Pendings.length; I++) {
            var NewCode = Pendings[I];
            // Sometimes, the new label starts with "label:"
            if (NewCode.Label.startsWith("label:")) {
                NewCode.Label = NewCode.Label.substring(6).trim();
            }
            // Sometimes, the new label starts with "phrase:"
            if (NewCode.Label.startsWith("phrase:")) {
                NewCode.Label = NewCode.Label.substring(7).trim();
            }
            // Sometimes, the new label is wrapped in ""
            if (NewCode.Label.startsWith('"') && NewCode.Label.endsWith('"')) {
                NewCode.Label = NewCode.Label.substring(1, NewCode.Label.length - 1);
            }
            // Sometimes, the new label ends with "."
            if (NewCode.Label.endsWith(".")) {
                NewCode.Label = NewCode.Label.substring(0, NewCode.Label.length - 1).trim();
            }
            // Sometimes, the order of labels is wrong (! found for gpt-3.5-turbo)
            const Found = Codes.findIndex((Code) => Code.Label == NewCode.Label);
            if (Found != -1 && Found !== I) {
                throw new Error(`Invalid response: code ${NewCode.Label}'s mapping order is wrong.`);
            }
        }
        // Update the codes
        UpdateCodes(Codebook, Pendings, Codes);
        // Remove temp labels
        Codes.forEach((Code) => delete Code.OldLabels);
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
    public async BuildPrompts(Codebook: Codebook, Codes: Code[]): Promise<[string, string]> {
        // Generate definitions for codes
        return [
            `
You are an expert in thematic analysis clarifying the criteria of qualitative codes. Do not attempt to merge codes now.
Consider provided quotes, and note that each quote is independent of others.
Write clear and generalizable criteria for each code and do not introduce unnecessary details.
If necessary, refine labels to be more accurate, but do not repeat yourself.
${ResearchQuestion}
Always follow the output format:
---
Definitions for each code (${Codes.length} in total):
1. 
Criteria: {Who did what, and how for code 1}
Label: {A descriptive label of code 1}
...
${Codes.length}.
Criteria: {Who did what, and how for code ${Codes.length}}
Label: {A descriptive label of code ${Codes.length}}
---`.trim(),
            Codes.map((Code, Index) =>
                `
${Index + 1}.
Label: ${Code.Label}
Quotes:
${TakeExamples(Code.Examples ?? [], 5)
    .map((Example) => `- ${Example}`)
    .join("\n")}`.trim(),
            ).join("\n\n"),
        ];
    }
}

/** TakeExamples: Take some best unique examples from a set. */
// Here, best is defined as the longest * most frequent unique quotes.
export function TakeExamples(Examples: string[], Take = 1000000): string[] {
    const ExampleMap = new Map<string, number>();
    for (var Example of Examples) {
        const Index = Example.indexOf("|||");
        if (Index != -1) {
            Example = Example.substring(Index + 3);
        }
        if (!ExampleMap.has(Example)) {
            ExampleMap.set(Example, 0);
        }
        ExampleMap.set(Example, ExampleMap.get(Example)! + 1);
    }
    for (var [Example, Count] of ExampleMap) {
        ExampleMap.set(Example, Count * Example.length);
    }
    return Array.from(ExampleMap.keys())
        .sort((A, B) => ExampleMap.get(B)! - ExampleMap.get(A)!)
        .slice(0, Take);
}
