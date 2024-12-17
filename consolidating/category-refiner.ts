import chalk from "chalk";
import { ResearchQuestion } from "../constants.js";
import { Code, Codebook, GetCategories } from "../utils/schema.js";
import { UpdateCategoriesByMap } from "./codebooks.js";
import { CodeConsolidator } from "./consolidator.js";

/** CategoryRefiner: Refine categories with LLMs. */
// Not used: we plan to switch to a cluster/naming approach instead of this workflow.
export class CategoryRefiner extends CodeConsolidator {
    /** SubunitFilter: Filter the subunits before chunking. */
    public SubunitFilter(Code: Code): boolean {
        return super.SubunitFilter(Code) && (Code.Categories?.length ?? 0) > 0;
    }
    /** OldCategories: The new categories for the codebook. */
    private OldCategories: string[] = [];
    /** NewCategories: The new categories for the codebook. */
    private NewCategories: Record<string, string[]> = {};
    /** BuildPrompts: Build the prompts for the code consolidator. */
    // In this case, we do not really use the LLM, so we just merge the codes
    public BuildPrompts(Codebook: Codebook, _Codes: Code[]): Promise<[string, string]> {
        const Frequencies = GetCategories(Codebook);
        const Categories = Object.keys(Frequencies);
        // We have too many categories. Filter ones with more than 1 instances.
        // Categories = Categories.filter(Category => Codes.filter(Code => Code.Categories?.includes(Category)).length > 1).sort();
        console.log(`Statistics: categories to merge: ${Categories.length}`);
        return Promise.resolve([
            `
You are an expert in thematic analysis.
You will identify input categories that can be merged into another. Find as many as possible. Prioritize merging smaller categories. Avoid creating huge categories. Names of new categories must concisely cover the aspects and stay in the research context.
${ResearchQuestion}
Always follow the output format:
---
# Draft Merging
* Category a
* Category b
=> Category c

* Category d
* Category e
=> Category f
...

# Reflection
Answer the following questions with detailed examples:
- Can you identify more categories for merging?
- Can you identify over-merged categories that should be split?
- Is any naming inaccurate?
Improve the draft plan into the final merging plan in the next section, following the same format.

# Final Merging
* Category g
* Category h
=> Category i

* Category j
* Category k
=> Category l
...
---`.trim(),
            /*`# Initial categories
${Categories.map((Category, Index) => `${Index + 1}. ${Category}. Codes:
${Codes.filter(Code => Code.Categories?.includes(Category)).map(Code => `* ${Code.Label}`).join("\n")}
`.trim()).join("\n")}*/
            `${Categories.map((Category, Index) => `${Index + 1}. ${Category} (${Frequencies.get(Category)?.length} codes)`).join("\n")}
        `.trim(),
        ]);
    }
    /** ParseResponse: Parse the response for the code consolidator. */
    public ParseResponse(Codebook: Codebook, Codes: Code[], Lines: string[]) {
        let Started = false;
        const Mappings = new Map<string, string>();
        let OldCategories: string[] = [];
        const OldLength = GetCategories(Codebook).size;
        // Parse the categories
        for (const Line of Lines) {
            if (Line === "" || Line.startsWith("---")) {
                continue;
            }
            // Start parsing when we see the final merging
            if (Line.toLowerCase() === "# draft merging") {
                Started = true;
            } else if (Line.toLowerCase() === "# final merging") {
                Started = true;
                Mappings.clear();
            } else if (!Started) {
                continue;
            }
            // Parse the merging destination
            const Towards = /^=> (.*)/.exec(Line);
            if (Towards) {
                let Target = Towards[1].trim().toLowerCase();
                // Sometimes, the LLM will return "{category} (10 codes)"
                if (Target.includes("(")) {
                    Target = Target.substring(0, Target.indexOf("(")).trim();
                }
                OldCategories.forEach((Category) => Mappings.set(Category, Target));
                OldCategories = [];
            }
            // Parse the merging source
            const Item = /^\* (.*)/.exec(Line);
            if (Item) {
                let Source = Item[1].trim().toLowerCase();
                // Sometimes, the LLM will return "{category} (10 codes)"
                if (Source.includes("(")) {
                    Source = Source.substring(0, Source.indexOf("(")).trim();
                }
                OldCategories.push(Source);
            }
        }
        // Update the categories
        if (Mappings.size === 0) {
            throw new Error("No categories are merged.");
        }
        UpdateCategoriesByMap(Mappings, Codes);
        // Write the logs
        const NewLength = GetCategories(Codebook).size;
        console.log(chalk.green(`Statistics: Categories merged from ${OldLength} to ${NewLength}`));
        return Promise.resolve(0);
    }
}
