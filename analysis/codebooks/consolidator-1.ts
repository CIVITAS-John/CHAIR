import { ClusterTexts } from '../../utils/embeddings.js';
import { SortCodes } from '../../utils/export.js';
import { Code, CodedThreads } from '../../utils/schema.js';
import { CodebookConsolidator, MergeCodesByCluster } from './codebooks.js';

/** Consolidator1: Consolidate a codebook through generating definitions for codes, then cluster them using text embeddings. */
export class Consolidator1<TUnit> extends CodebookConsolidator<TUnit> {
    /** Name: The name of the analyzer. */
    public Name: string = "consolidator-1";
    /** BaseTemperature: The base temperature for the LLM. */
    public BaseTemperature: number = 0;
    /** MaxIterations: The maximum number of iterations for the analyzer. */
    public MaxIterations: number = 5;
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
    /** RefineCategories: The iteration that refines categories. */
    public readonly RefineCategories: number = 5;
    /** AssignCategories: The iteration that assigns categories. */
    public readonly AssignCategories: number = 6;
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
            case this.RefineCategories:
                // Only when the code has definitions should we use it to refine categories
                return (Code.Definitions?.length ?? 0) > 0;
            default: 
                return true;
        }
    }
    /** BuildPrompts: Build the prompts for the LLM. */
    public async BuildPrompts(Analysis: CodedThreads, Data: TUnit[], Codes: Code[], ChunkStart: number, Iteration: number): Promise<[string, string]> {
        // Collect the existing categories from the codebook
        var Categories = [...new Set(Object.values(Analysis.Codebook!).map(Code => Code.Categories ?? []).flat().filter(Category => Category != ""))];
        switch (Iteration) {
            case this.GenerateDefinitions:
                // Generate definitions for codes
                return [`
You are an expert in thematic analysis clarifying the criteria of qualitative codes. Quotes are independent of each other.
First, identify some potential categories for all codes in short phrases.
Then, write short, clear, generalizable criteria without unnecessary specifics or examples. Refine the label if necessary. Group each code into a category.
The research question is: How did Physics Lab's online community emerge?
Always follow the output format:
---
Potential categories:
a. {Category A}
b. {Category B}
...

Definitions for each code (${Codes.length} in total):
1. 
Label: {Label 1}
Criteria: {Criteria of code 1}
Category: {The category of code 1}
...
${Codes.length}.
Label: {Label ${Codes.length}}
Criteria: {Criteria of code ${Codes.length}}
Category: {The category of code ${Codes.length}}
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
You are an expert in thematic analysis. Each code is merged from multiple ones.
First, identify some potential categories for all codes in short phrases.
Then, the labels and criteria to make each code cover all criteria while staying concise and clear. Write generalizable definitions without unnecessary specifics or examples. Group each code into a category.
The research question is: How did Physics Lab's online community emerge?
Always follow the output format:
---
Potential categories:
a. {Category A}
b. {Category B}
...

Definitions for each code (${Codes.length} in total):
1.
Label: {Label 1}
Criteria: {Criteria of code 1}
Category: {The category of code 1}
...
${Codes.length}.
Label: {Label ${Codes.length}}
Criteria: {Criteria of code ${Codes.length}}
Category: {The category of code ${Codes.length}}
---`.trim(), 
                    Codes.map((Code, Index) => `
${Index + 1}. ${(Code.Alternatives ?? []).concat(Code.Label).join(", ") ?? ""}.
${Code.Definitions?.map(Definition => `- ${Definition}`).join("\n")}`.trim()).join("\n\n")];
            case this.MergeLabels:
            case this.MergeLabelsAgain:
                // Cluster codes using text embeddings
                // Combine each code into a string for clustering
                var CodeStrings = Codes.map(Code => {
                    var Text = `Label: ${Code.Label}`;
                    if ((Code.Definitions?.length ?? 0) > 0) Text += `\nDefinition: ${Code.Definitions![0]}`;
                    return Text.trim();
                });
                // Categorize the strings
                var Clusters = await ClusterTexts(CodeStrings, this.Name);
                // Merge the codes
                Analysis.Codebook = MergeCodesByCluster(Clusters, Codes);
                return ["", ""];
            case this.RefineCategories:
                // Raw codes are too many. We only use frequent ones to refine categories.
                return [`
You are an expert in thematic analysis.
You are trying to optimize structured themes to categorize the known qualitative codes. Themes should be generalizable findings, not speculations or hypotheses.
Avoid overlapping concepts between themes. Each theme or sub-theme should cover multiple codes. Never not introduce new information.
The research question is: How did Physics Lab's online community emerge?
Always follow the output format:
---
Thoughts: {Thoughts and plans about structuring input qualitative codes into themes around the research question.}
Initial Themes:
1. Theme 1
  - Subtheme 1
  - Subtheme 2
2. Theme 2
...
---
Reflections: {Reflection on the initial themes. Find examples of overlapping, redundant concepts that could be merged. Find examples of missing concepts that could be added or separated.}
Organized Themes:
1. Theme 1
  - Subtheme 1
  - Subtheme 2
2. Theme 2
...
---`.trim(), 
                    SortCodes(Codes).filter(Code => Code.Alternatives!.length > 0 || Code.Categories!.length > 0)
                        .map((Code, Index) => `* ${Code.Label} (${Code.Categories![0]})\n${Code.Definitions![0]}`).join("\n\n")];
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
                var Pendings: Record<number, Code> = {};
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
                        CurrentCode = { Label: "", Definitions: [], Categories: [], Examples: [], Alternatives: [] };
                        Pendings[Index] = CurrentCode;
                        // Sometimes, the label is merged with the number
                        Pendings[Index].Label = Line.substring(Match[0].length).trim();
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
                for (var I = 0; I < Codes.length; I++) {
                    var Code = Pendings[I];
                    if (!Code) break;
                    var NewLabel = Code.Label.toLowerCase();
                    if (NewLabel != Codes[I].Label) {
                        Codes[I].Alternatives = Codes[I].Alternatives ?? [];
                        Codes[I].Alternatives!.push(Codes[I].Label);
                        Codes[I].Label = NewLabel;
                    }
                    Codes[I].Alternatives = Codes[I].Alternatives?.filter(Label => Label != Codes[I].Label);
                    Codes[I].Definitions = Code.Definitions;
                    Codes[I].Categories = Code.Categories;
                }
                // Return the cursor movement
                return Object.keys(Pendings).length - Codes.length;
        }
        return 0;
    }
}