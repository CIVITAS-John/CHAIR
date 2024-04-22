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
    public MaxIterations: number = 4;
    /** GenerateDefinitions: The iteration that generates definition. */
    public readonly GenerateDefinitions: number = 0;
    /** MergeLabels: The iteration that merges labels. */
    public readonly MergeLabels: number = 1;
    /** MergeLabelsAgain: The iteration that merges labels again. */
    public readonly MergeLabelsAgain: number = 2;
    /** RefineDefinitions: The iteration that refines definitions. */
    public readonly RefineDefinitions: number = 3;
    /** GetChunkSize: Get the chunk size and cursor movement for the LLM. */
    // Return value: [Chunk size, Cursor movement]
    public GetChunkSize(Recommended: number, Remaining: number, Iteration: number) {
        switch (Iteration) {
            case this.GenerateDefinitions:
            case this.RefineDefinitions:
                return Recommended;
            case this.MergeLabels:
            case this.MergeLabelsAgain:
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
            default: 
                return true;
        }
    }
    /** BuildPrompts: Build the prompts for the LLM. */
    public async BuildPrompts(Analysis: CodedThreads, Data: TUnit[], Codes: Code[], ChunkStart: number, Iteration: number): Promise<[string, string]> {
        switch (Iteration) {
            case this.GenerateDefinitions:
                // Generate definitions for codes
                // For weaker models, we will need to provide more guidance
                return [`
You are an expert in thematic analysis clarifying the definitions of qualitative codes.
Write short, clear, generalizable definitions without unnecessary specifics or examples.
Example quotes are independent of each other.
Always follow the output format for all ${Codes.length} codes:
---
1. ${LLMName == "gpt-3.5-turbo" ? "{Code}: " : ""}{Definition of code 1}
...
${Codes.length}. ${LLMName == "gpt-3.5-turbo" ? "{Code}: " : ""}{Definition of code ${Codes.length}}
---`.trim(), 
                    Codes.map((Code, Index) => `
${Index + 1}. ${Code.Label}. Quotes:
${Code.Examples?.sort((A, B) => B.length - A.length).slice(0, 3).map(Example => `- ${Example}`).join("\n")}`.trim()).join("\n\n")];
            case this.RefineDefinitions:
                // Refine definitions for codes
                return [`
You are an expert in thematic analysis.
Each code is merged from multiple ones. Refine the labels and definitions to make each code cover all definitions while staying concise and clear.
Write generalizable definitions without unnecessary specifics or examples.
Always follow the output format for all ${Codes.length} codes:
---
1.
Label: {Label}
Definition: {Definition of code 1}
Category: {Category of code 1}
...
${Codes.length}.
Label: {Label}
Definition: {Definition of code ${Codes.length}}
Category: {Category of code ${Codes.length}}
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
            default:
                return ["", ""];
        }
    }
    /** ParseResponse: Parse the responses from the LLM. */
    public async ParseResponse(Analysis: CodedThreads, Lines: string[], Codes: Code[], ChunkStart: number, Iteration: number): Promise<Record<number, string>> {
        switch (Iteration) {
            case this.GenerateDefinitions:
                // Generate definitions for codes
                var Results: string[] = [];
                Codes = Codes.filter(Code => (Code.Definitions?.length ?? 0) == 0);
                // Parse the definitions
                for (var I = 0; I < Lines.length; I++) {
                    var Match = Lines[I].match(/^(\d+)\. (.*)$/);
                    if (Match) {
                        var Definition = Match[2].trim();
                        // Sometimes the LLM will return "{code}: {definition}"
                        if (Definition.match(/^[\w\-\_ ]+\: /)) Definition = Definition.substring(Definition.indexOf(":") + 1).trim();
                        // Sometimes the LLM will return "{definition}"
                        if (Definition.startsWith("{") && Definition.endsWith("}")) Definition = Definition.substring(1, Codes.length - 1);
                        Results[parseInt(Match[1]) - 1] = Definition;
                    }
                }
                // Check if the response is valid
                if (Results.length != Codes.length) 
                    throw new Error(`Invalid response: ${Results.length} results for ${Codes.length} inputs`);
                // Update the codes
                for (var I = 0; I < Codes.length; I++) {
                    Codes[I].Definitions = [Results[I]];
                }
                break;
        }
        return {};
    }
}