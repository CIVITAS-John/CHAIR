import { ResearchQuestion } from "../constants.js";
import { Code, Codebook, GetCategories } from "../utils/schema.js";
import { CodeConsolidator } from "./consolidator.js";

/** CategoryAssigner: Assign categories with LLMs. */
// Not used: we plan to switch to a cluster/naming approach instead of this workflow.
export class CategoryAssigner extends CodeConsolidator {
    /** Chunckified: Whether the consolidator needs chunkified results. */
    public Chunkified = true;
    /** SubunitFilter: Filter the subunits before chunking. */
    public SubunitFilter(Code: Code): boolean {
        return super.SubunitFilter(Code) && (Code.Definitions?.length ?? 0) > 0;
    }
    /** BuildPrompts: Build the prompts for the code consolidator. */
    // In this case, we do not really use the LLM, so we just merge the codes
    public BuildPrompts(Codebook: Codebook, Codes: Code[]): Promise<[string, string]> {
        const Frequencies = GetCategories(Codebook);
        const Categories = Object.keys(Frequencies);
        // We have too many categories. Filter ones with more than 1 instances.
        // Categories = Categories.filter(Category => Codes.filter(Code => Code.Categories?.includes(Category)).length > 1).sort();
        return Promise.resolve([
            `
You are an expert in thematic analysis. You are assigning categories to qualitative codes based on their definitions.
For each code, assign the closest category from the following list. Use "miscellaneous" if none fits.
---
${Categories.filter((Category) => Category !== "miscellaneous")
    .map((Category) => `* ${Category}`)
    .join("\n")}
---
${ResearchQuestion}
Always follow the output format:
---
Category for each code (${Codes.length} in total):
1. Code 1
{The most relevant category for code 1}
...
${Codes.length}. Code ${Codes.length}
{The most relevant category for code ${Codes.length}}
---`.trim(),
            `
Qualitative codes:
${Codes.map((Code, Index) => `${Index + 1}. ${Code.Label}\n${Code.Definitions?.[0]}`).join("\n\n")}
`.trim(),
        ]);
    }
    /** ParseResponse: Parse the response for the code consolidator. */
    public ParseResponse(_Codebook: Codebook, Codes: Code[], Lines: string[]) {
        const Results: string[] = [];
        // Parse the categories
        for (let I = 0; I < Lines.length; I++) {
            const Line = Lines[I];
            if (Line === "" || Line.startsWith("---")) {
                continue;
            }
            let Match = /^(\d+)\./.exec(Line);
            if (Match) {
                let Category = "";
                if (I + 1 >= Lines.length || /^\d+\./.exec(Lines[I + 1])) {
                    Category = Line.substring(Match[0].length).trim().toLowerCase();
                    // if (Category == Codes[Results.length].Label) continue;
                } else {
                    Category = Lines[I + 1].trim().toLowerCase();
                }
                // Sometimes, the LLM will return "Code 1 - {category}"
                Match = /^code (\d+) -/.exec(Category);
                if (Match) {
                    Category = Category.substring(Match[0].length).trim();
                }
                // Sometimes, the LLM will return "{category}"
                if (Category.startsWith("{") && Category.endsWith("}")) {
                    Category = Category.substring(1, Category.length - 1);
                }
                // Sometimes, the LLM will return "**category**"
                if (Category.startsWith("**") && Category.endsWith("**")) {
                    Category = Category.substring(2, Category.length - 2);
                }
                Results.push(Category);
            }
        }
        // Update the codes
        if (Results.length !== Codes.length) {
            throw new Error(`Invalid response: ${Results.length} results for ${Codes.length} codes.`);
        }
        for (let I = 0; I < Codes.length; I++) {
            Codes[I].Categories = [Results[I]];
        }
        return Promise.resolve(0);
    }
}
