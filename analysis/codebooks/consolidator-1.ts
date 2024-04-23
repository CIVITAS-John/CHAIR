import { ClusterTexts } from '../../utils/embeddings.js';
import { LLMName } from '../../utils/llms.js';
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
    /** MergeLabelsAgain: The iteration that merges labels again. */
    public readonly MergeLabelsAgain: number = 2;
    /** RefineDefinitions: The iteration that refines definitions. */
    public readonly RefineDefinitions: number = 3;
    /** RefineCategories: The iteration that refines categories. */
    public readonly RefineCategories: number = 4;
    /** AssignCategories: The iteration that assigns categories. */
    public readonly AssignCategories: number = 5;
    /** GetChunkSize: Get the chunk size and cursor movement for the LLM. */
    // Return value: [Chunk size, Cursor movement]
    public GetChunkSize(Recommended: number, Remaining: number, Iteration: number) {
        switch (Iteration) {
            case this.GenerateDefinitions:
            case this.RefineDefinitions:
            case this.AssignCategories:
                return Recommended;
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
                // Only when the code has multiple definitions should we refine them
                return (Code.Definitions?.length ?? 0) > 1;
            case this.MergeLabels:
                // Only when the code has definitions should we merge them
                return (Code.Definitions?.length ?? 0) > 0;
            case this.MergeLabelsAgain:
                // Only when the code has definitions but no categories should we merge them again
                // Because high-level codes could be over-merged
                return (Code.Definitions?.length ?? 0) > 0 && (Code.Categories?.length ?? 0) == 0;
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
Write short, clear, generalizable criteria without unnecessary specifics or examples. Rename the label if necessary.
Then, group each code into a theme, with a short phrase. For example:
---
${Categories.length > 0 ? `${Categories.sort().join("\n")}` : "design discussions\nsocial interactions\ntechnical topics"}
---
The research question is: How did Physics Lab's online community emerge?
Always follow the output format for all ${Codes.length} codes:
---
1. 
Label: {Label 1}
Criteria: {Criteria of code 1}
Theme: {A theme of code 1}
...
${Codes.length}.
Label: {Label ${Codes.length}}
Criteria: {Criteria of code ${Codes.length}}
Theme: {A theme of code ${Codes.length}}
---`.trim(), 
                    Codes.map((Code, Index) => `
${Index + 1}.
Label: ${Code.Label}
Quotes:
${Code.Examples?.sort((A, B) => B.length - A.length).slice(0, 3).map(Example => `- ${Example}`).join("\n")}`.trim()).join("\n\n")];
            case this.RefineDefinitions:
                // Refine definitions for codes
                return [`
You are an expert in thematic analysis.
Each code is merged from multiple ones. Refine the labels and criteria to make each code cover all criteria while staying concise and clear. Then, assign relevant themes.
Write generalizable definitions without unnecessary specifics or examples.
Then, group each code into a theme, with a short phrase. For example:
---
${Categories.length > 0 ? `${Categories.sort().join("\n")}` : "design discussions\nsocial interactions\ntechnical topics"}
---
The research question is: How did Physics Lab's online community emerge?
Always follow the output format for all ${Codes.length} codes:
---
1.
Label: {Label 1}
Criteria: {Criteria of code 1}
Theme: {A theme of code 1}
...
${Codes.length}.
Label: {Label ${Codes.length}}
Criteria: {Criteria of code ${Codes.length}}
Theme: {A theme of code ${Codes.length}}
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
                    // Categories may lead to over-merging, so we will skip them
                    // if ((Code.Categories?.length ?? 0) > 0) Text += `\nCategories: \n- ${Code.Categories!.join("\n")}`;
                    if ((Code.Definitions?.length ?? 0) > 0) Text += `\nDefinitions: \n- ${Code.Definitions!.join("\n")}`;
                    if ((Code.Alternatives?.length ?? 0) > 0) Text += `\nAlternatives: \n- ${Code.Alternatives!.join("\n")}`;
                    // Examples may result in confusing embeddings, so we will skip them
                    // if ((Code.Examples?.length ?? 0) > 0) Text += `\nExamples: \n- ${Code.Examples!.join("\n")}`;
                    return Text;
                });
                // Categorize the strings
                var Clusters = await ClusterTexts(CodeStrings, this.Name);
                // Merge the codes
                Analysis.Codebook = MergeCodesByCluster(Clusters, Codes);
                return ["", ""];
            case this.RefineCategories:
                return [`
You are an expert in thematic analysis.
You are trying to optimize structured themes to categorize the known qualitative codes. 
Avoid overlapping concepts between themes. Each theme or sub-theme should cover multiple codes. Never not introduce new information.
The research question is: How did Physics Lab's online community emerge?
Always follow the output format:
---
Thoughts: {Thoughts and plans about structuring input qualitative codes into themes around the research question.}
Organized Themes:
1. Theme 1
  - Subtheme 1
  - Subtheme 2
2. Theme 2
...
---
Reflections: {Reflection on the organized themes. Find overlapping or redundant concepts. Identify what could be merged or separated.}
Optimized Themes:
1. Theme 1
  - Subtheme 1
  - Subtheme 2
2. Theme 2
...
---`.trim(), 
                    Codes.map((Code, Index) => `${Code.Label}:
Criteria: ${Code.Definitions![0]}
Theme: ${Code.Categories![0]}`).join("\n")];
            default:
                return ["", ""];
        }
    }
    /** ParseResponse: Parse the responses from the LLM. */
    public async ParseResponse(Analysis: CodedThreads, Lines: string[], Codes: Code[], ChunkStart: number, Iteration: number): Promise<Record<number, string>> {
        switch (Iteration) {
            case this.GenerateDefinitions:
            case this.RefineDefinitions:
                // Refine definitions for codes
                var Pendings: Record<number, Code> = {};
                var CurrentCode: Code | undefined;
                var Status = "";
                // Parse the definitions
                for (var I = 0; I < Lines.length; I++) {
                    var Line = Lines[I];
                    if (Line == "" || Line.startsWith("---")) continue;
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
                    } else if (Line.startsWith("Theme:") && CurrentCode) {
                        var Category = Line.substring(6).trim();
                        if (Category !== "")
                            CurrentCode.Categories = [Category.toLowerCase()];
                        Status = "Theme";
                    } else if (Status == "Label") {
                        CurrentCode!.Label = `${CurrentCode!.Label}\n${Line}`.trim();
                    } else if (Status == "Criteria") {
                        CurrentCode!.Definitions!.push(Line.trim());
                    } else if (Status == "Theme") {
                        CurrentCode!.Categories!.push(Line.trim());
                    }
                }
                // Check if the response is valid
                if (Object.keys(Pendings).length != Codes.length) 
                    throw new Error(`Invalid response: ${Object.keys(Pendings).length} results for ${Codes.length} inputs`);
                // Update the codes
                for (var I = 0; I < Codes.length; I++) {
                    var Code = Pendings[I];
                    var NewLabel = Code.Label.toLowerCase();
                    if (NewLabel != Codes[I].Label) {
                        Codes[I].Alternatives!.push(Codes[I].Label);
                        Codes[I].Label = NewLabel;
                    }
                    Codes[I].Alternatives = Codes[I].Alternatives?.filter(Label => Label != Codes[I].Label);
                    Codes[I].Definitions = Code.Definitions;
                    Codes[I].Categories = Code.Categories;
                }
                break;
        }
        return {};
    }
}