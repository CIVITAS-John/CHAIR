import { ResearchQuestion } from '../../constants.js';
import { ClusterTexts } from '../../utils/embeddings.js';
import { SortCodes } from '../../utils/export.js';
import { Code, CodedThreads, GetCategories } from '../../utils/schema.js';
import { AssignCategoriesByCluster, CodebookConsolidator, MergeCategoriesByCluster, MergeCodesByCluster, UpdateCategories, UpdateCategoriesByMap, UpdateCodes } from './codebooks.js';

/** Consolidator1: Consolidate a codebook through generating definitions for codes, then cluster them using text embeddings. */
export class Consolidator1<TUnit> extends CodebookConsolidator<TUnit> {
    /** Name: The name of the analyzer. */
    public Name: string = "consolidator-1";
    /** BaseTemperature: The base temperature for the LLM. */
    public BaseTemperature: number = 0;
    /** MaxIterations: The maximum number of iterations for the analyzer. */
    public MaxIterations: number = 8;
    /** GenerateDefinitions: The iteration that generates definition. */
    public readonly GenerateDefinitions: number = 0;
    /** MergeLabels: The iteration that merges labels. */
    public readonly MergeLabels: number = 1;
    /** RefineDefinitions: The iteration that refines definitions. */
    public readonly RefineDefinitions: number = 2;
    /** MergeLabelsAgain: The iteration that merges labels again. */
    public readonly MergeLabelsAgain: number = 3;
    /** RefineDefinitionsAgain: The iteration that refines definitions again. */
    public readonly RefineDefinitionsAgain: number = 4;
    /** MergeCategories: The iteration that merge into initial categories. */
    public readonly MergeCategories: number = 5;
    /** RefineCategories: The iteration that refines categories. */
    public readonly RefineCategories: number = 6;
    /** AssignCategories: The iteration that assigns categories. */
    public readonly AssignCategories: number = 7;
    /** GetChunkSize: Get the chunk size and cursor movement for the LLM. */
    // Return value: [Chunk size, Cursor movement]
    public GetChunkSize(Recommended: number, Remaining: number, Iteration: number, Tries: number) {
        switch (Iteration) {
            case this.GenerateDefinitions:
            case this.RefineDefinitions:
            case this.RefineDefinitionsAgain:
            case this.AssignCategories:
                return Math.max(Recommended - Tries * 8, 1);
            case this.MergeLabels:
            case this.MergeLabelsAgain:
            case this.MergeCategories:
            case this.RefineCategories:
                return Remaining;
            default: 
                return -1;
        }
    }
    /** SubunitFilter: Filter the subunits before chunking. */
    public SubunitFilter(Code: Code, Iteration: number): boolean {
        if (Code.Label == "[Merged]") return false;
        switch (Iteration) {
            case this.GenerateDefinitions:
                // Only when the code has no definitions should we generate them
                return (Code.Definitions?.length ?? 0) == 0;
            case this.RefineDefinitions:
            case this.RefineDefinitionsAgain:
                // Only when the code has multiple definitions should we refine them
                return (Code.Definitions?.length ?? 0) > 1;
            case this.MergeLabels:
            case this.MergeLabelsAgain:
                // Only when the code has definitions should we merge them
                return (Code.Definitions?.length ?? 0) > 0;
            case this.MergeCategories:
                // Only when the code has 1 category should we use it to merge and refine categories
                return (Code.Categories?.length ?? 0) == 1;
            default: 
                return true;
        }
    }
    /** BuildPrompts: Build the prompts for the LLM. */
    public async BuildPrompts(Analysis: CodedThreads, Data: TUnit[], Codes: Code[], ChunkStart: number, Iteration: number): Promise<[string, string]> {
        // Collect the existing categories from the codebook
        var Categories = GetCategories(Analysis.Codebook!);
        switch (Iteration) {
            case this.GenerateDefinitions:
                // Generate definitions for codes
                return [`
You are an expert in thematic analysis clarifying the criteria of qualitative codes. Quotes are independent of each other.
Write clear and generalizable criteria to apply across quotes, without unnecessary specifics or examples. Then, refine the short label if necessary.
Group each code into a theory-informed category. Use 2-4 words for categories to provide general contexts (e.g. "social interaction" instead of "interaction", "communication approach" instead of "communication").
${ResearchQuestion}
Always follow the output format:
---
Thoughts: 
* {Your plan to categorize the codes related to the research question and theoretical lens}

Definitions for each code (${Codes.length} in total):
1. 
Label: {A label of code 1}
Criteria: {Criteria of code 1}
Category: {2-4 words for code 1}
...
${Codes.length}.
Label: {A label of code ${Codes.length}}
Criteria: {Criteria of code ${Codes.length}}
Category: {2-4 words for code ${Codes.length}}
---`.trim(), 
                    Codes.map((Code, Index) => `
${Index + 1}.
Label: ${Code.Label}
Quotes:
${Code.Examples?.sort((A, B) => B.length - A.length).slice(0, 3).map(Example => `- ${Example}`).join("\n")}`.trim()).join("\n\n")];
            case this.RefineDefinitions:
            case this.RefineDefinitionsAgain:
                // Refine definitions for codes
                return [`
You are an expert in thematic analysis. 
Each code is merged from multiple ones. Write a single label and criteria to apply across quotes. Both should be clear and generalizable, without unnecessary specifics or examples.
Group each code into a theory-informed category. Use 2-4 words for categories and avoid over-generalization (e.g. "social interaction" instead of "interaction", "communication approach" instead of "communication").
${ResearchQuestion}
Always follow the output format:
---
Thoughts: 
* {Your plan to categorize the codes related to the research question and theoretical lens}

Definitions for each code (${Codes.length} in total):
1.
Label: {A label of code 1}
Criteria: {Criteria of code 1}
Category: {2-4 words for code 1}
...
${Codes.length}.
Label: {A label of code ${Codes.length}}
Criteria: {Criteria of code ${Codes.length}}
Category: {2-4 words for code ${Codes.length}}
---`.trim(), 
                    Codes.map((Code, Index) => `
${Index + 1}. ${(Code.Alternatives ?? []).concat(Code.Label).join(", ") ?? ""}.
${Code.Definitions?.map(Definition => `- ${Definition}`).join("\n")}`.trim()).join("\n\n")];
            case this.MergeLabels:
            case this.MergeLabelsAgain:
                // Cluster codes using text embeddings
                // Combine each code into a string for clustering
                var CodeStrings = Codes.map(Code => {
                    var Text = `${Code.Label}`;
                    if ((Code.Definitions?.length ?? 0) > 0) Text += `: ${Code.Definitions![0]}`;
                    return Text.trim();
                });
                // Categorize the strings
                var Clusters = await ClusterTexts(CodeStrings, this.Name);
                // Merge the codes
                Analysis.Codebook = MergeCodesByCluster(Clusters, Codes);
                return ["", ""];
            case this.MergeCategories:
                // Cluster categories using text embeddings
                var Clusters = await ClusterTexts(Categories, this.Name);
                var Merged = MergeCategoriesByCluster(Clusters, Categories, Codes);
                var Count = Object.keys(Merged).length;
                (Analysis as any).Categories = Object.keys(Merged);
                // Ask LLMs to write new names for each category
                return [`
You are an expert in thematic analysis. You are assigning names for categories based on the merging results.
Make sure those names are concise, accurate, and related to the research question. Use 2-4 words and avoid over-generalization (e.g. "social interaction" instead of "interaction", "communication approach" instead of "communication").
${ResearchQuestion}
Always follow the output format:
---
Names for each category (${Count} in total):
1. {2-4 words for category 1}
...
${Count}. {2-4 words for category ${Count}}
---`.trim(), "Merge results:\n" + Object.keys(Merged).map((Category, Index) => `${Index + 1}.\n${Category.split("|").map(Current => `- ${Current}`).join("\n")}`).join("\n\n")];
            case this.RefineCategories:
                // We have too many categories. Filter ones with more than 1 instances.
                Categories = Categories.filter(Category => Codes.filter(Code => Code.Categories?.includes(Category)).length > 1).sort();
                return [`
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
- Did you make categories too large?
- Can you identify more categories for merging?
- Is any naming inaccurate?
Revise and rewrite the final merging plan in the next section, following the same format.

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
                `${Categories.map((Category, Index) => `${Index + 1}. ${Category} (${Codes.filter(Code => Code.Categories?.includes(Category)).length} codes)`).join("\n")}
                `.trim()];
            case this.AssignCategories:
                // We have too many categories. Filter ones with more than 1 instances.
                Categories = Categories.filter(Category => Object.values(Analysis.Codebook!).filter(Code => Code.Categories?.includes(Category)).length > 1).sort();
                return [`
You are an expert in thematic analysis. You are assigning categories to qualitative codes based on their definitions.
For each code, assign the closest category from the following list. Use "miscellaneous" if none fits.
---
${Categories.filter(Category => Category != "miscellaneous").map((Category, Index) => `* ${Category}`).join("\n")}
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
${Codes.map((Code, Index) => `${Index + 1}. ${Code.Label}${Categories.includes(Code.Categories![0]) ? ` (maybe ${Code.Categories![0]})` : ""}\n${Code.Definitions![0]}`).join("\n\n")}
`.trim()];
            default:
                return ["", ""];
        }
    }
    /** ParseResponse: Parse the responses from the LLM. */
    public async ParseResponse(Analysis: CodedThreads, Lines: string[], Codes: Code[], ChunkStart: number, Iteration: number): Promise<number> {
        switch (Iteration) {
            case this.GenerateDefinitions:
            case this.RefineDefinitions:
            case this.RefineDefinitionsAgain:
                // Refine definitions for codes
                var Pendings: Code[] = [];
                var CurrentCode: Code | undefined;
                var Status = "";
                // Parse the definitions
                for (var I = 0; I < Lines.length; I++) {
                    var Line = Lines[I];
                    if (Line == "" || Line.startsWith("---")) continue;
                    // If we see "...", that means later codes are not processed and should be truncated
                    if (Line == "...") break;
                    var Match = Line.match(/^(\d+)\./);
                    if (Match) {
                        var Index = parseInt(Match[1]) - 1;
                        // Sometimes, the label is merged with the number
                        CurrentCode = { Label: Line.substring(Match[0].length).trim(), Definitions: [], Categories: [], Examples: [], Alternatives: [] };
                        Pendings.push(CurrentCode);
                    } else if (Line.startsWith("Label:") && CurrentCode) {
                        CurrentCode.Label = Line.substring(6).trim();
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
                // Update the codes
                UpdateCodes(Analysis.Codebook!, Pendings, Codes);
                // Return the cursor movement
                return Object.keys(Pendings).length - Codes.length;
            case this.MergeCategories:
                var Categories = (Analysis as any).Categories as string[];
                delete (Analysis as any).Categories;
                var Results: string[] = [];
                // Parse the categories
                for (var I = 0; I < Lines.length; I++) {
                    var Line = Lines[I];
                    if (Line == "" || Line.startsWith("---")) continue;
                    var Match = Line.match(/^(\d+)\./);
                    if (Match) {
                        var Index = parseInt(Match[1]) - 1;
                        var Category = Line.substring(Match[0].length).trim().toLowerCase();
                        Results.push(Category);
                    }
                }
                // Update the categories
                if (Results.length != Categories.length) throw new Error(`Invalid response: ${Results.length} results for ${Categories.length} categories.`);
                UpdateCategories(Categories, Results, Codes);
                break;
            case this.RefineCategories:
                var Started = false;
                var Mappings = new Map<string, string>();
                var OldCategories: string[] = [];
                // Parse the categories
                for (var I = 0; I < Lines.length; I++) {
                    var Line = Lines[I];
                    if (Line == "" || Line.startsWith("---")) continue;
                    // Start parsing when we see the final merging
                    if (Line.toLowerCase() == "# final merging") Started = true;
                    else if (!Started) continue;
                    // Parse the merging destination
                    var Towards = Line.match(/^\=\> (.*)/);
                    if (Towards) {
                        var Target = Towards[1].trim().toLowerCase();
                        OldCategories.forEach(Category => Mappings.set(Category, Target));
                        OldCategories = [];
                    }
                    // Parse the merging source
                    var Item = Line.match(/^\* (.*)/);
                    if (Item) OldCategories.push(Item[1].trim().toLowerCase());
                }
                // Update the categories
                if (Mappings.size == 0) throw new Error("No categories are merged.");
                UpdateCategoriesByMap(Mappings, Codes);
                break;
            case this.AssignCategories:
                var Results: string[] = [];
                // Parse the categories
                for (var I = 0; I < Lines.length; I++) {
                    var Line = Lines[I];
                    if (Line == "" || Line.startsWith("---")) continue;
                    var Match = Line.match(/^(\d+)\./);
                    if (Match) {
                        var Category = "";
                        if (I + 1 >= Lines.length || Lines[I + 1].match(/^\d+\./)) {
                            Category = Line.substring(Match[0].length).trim().toLowerCase();
                            // if (Category == Codes[Results.length].Label) continue;
                        } else Category = Lines[I + 1].trim().toLowerCase();
                        // Sometimes, the LLM will return "{category}"
                        if (Category.startsWith("{") && Category.endsWith("}")) Category = Category.substring(1, Category.length - 1);
                        Results.push(Category);
                    }
                }
                // Update the codes
                if (Results.length != Codes.length) throw new Error(`Invalid response: ${Results.length} results for ${Codes.length} codes.`);
                for (var I = 0; I < Codes.length; I++)
                    Codes[I].Categories = [Results[I]];
                break;
        }
        return 0;
    }
}