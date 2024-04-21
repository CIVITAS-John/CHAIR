import { ClusterTexts } from '../../utils/embeddings.js';
import { LLMName } from '../../utils/llms.js';
import { Code, CodedThreads } from '../../utils/schema.js';
import { CodebookConsolidator } from './codebooks.js';

/** Consolidator1: Consolidate a codebook through generating definitions for codes, then cluster them using text embeddings. */
export class Consolidator1<TUnit> extends CodebookConsolidator<TUnit> {
    /** Name: The name of the analyzer. */
    public Name: string = "consolidator-1";
    /** BaseTemperature: The base temperature for the LLM. */
    public BaseTemperature: number = 0;
    /** MaxIterations: The maximum number of iterations for the analyzer. */
    public MaxIterations: number = 3;
    /** GenerateDefinition: The iteration that generates definition. */
    public readonly GenerateDefinition: number = 0;
    /** MergeLabels: The iteration that merges labels. */
    public readonly MergeLabels: number = 1;
    /** MergeLabelsAgain: The iteration that merges labels again. */
    public readonly MergeLabelsAgain: number = 2;
    /** GetChunkSize: Get the chunk size and cursor movement for the LLM. */
    // Return value: [Chunk size, Cursor movement]
    public GetChunkSize(Recommended: number, Remaining: number, Iteration: number) {
        switch (Iteration) {
            case this.GenerateDefinition:
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
            case this.GenerateDefinition:
                return (Code.Definitions?.length ?? 0) == 0;
            case this.MergeLabels:
            case this.MergeLabelsAgain:
                return (Code.Definitions?.length ?? 0) > 0;
            default: 
                return true;
        }
    }
    /** BuildPrompts: Build the prompts for the LLM. */
    public async BuildPrompts(Analysis: CodedThreads, Data: TUnit[], Codes: Code[], ChunkStart: number, Iteration: number): Promise<[string, string]> {
        switch (Iteration) {
            case this.GenerateDefinition:
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
            case this.MergeLabels:
            case this.MergeLabelsAgain:
                // Cluster codes using text embeddings
                // Combine each code into a string for clustering
                var CodeStrings = Codes.map(Code => {
                    var Text = `Label: ${Code.Label}`;
                    if ((Code.Categories?.length ?? 0) > 0) Text += `\nCategories: \n- ${Code.Categories!.join("\n")}`;
                    if ((Code.Definitions?.length ?? 0) > 0) Text += `\nDefinitions: \n- ${Code.Definitions!.join("\n")}`;
                    if ((Code.Alternatives?.length ?? 0) > 0) Text += `\nAlternatives: \n- ${Code.Alternatives!.join("\n")}`;
                    // Examples may result in confusing embeddings, so we will skip them
                    // if ((Code.Examples?.length ?? 0) > 0) Text += `\nExamples: \n- ${Code.Examples!.join("\n")}`;
                    return Text;
                });
                // Categorize the strings
                var Clusters = await ClusterTexts(CodeStrings, this.Name);
                var Codebook: Record<string, Code> = {};
                // Merge the codes based on clustering results
                for (var Key of Object.keys(Clusters)) {
                    var ClusterID = parseInt(Key);
                    // Pick the code with the highest probability and the shortest label + definition to merge into
                    // This could inevitably go wrong. We will need another iteration to get a better new label
                    var BestCode = Clusters[ClusterID]
                        .sort((A, B) => B.Probability - A.Probability)
                        .map(Item => Codes[Item.ID])
                        .sort((A, B) => (A.Label.length * 5 + (A.Definitions?.[0].length ?? 0)) - (B.Label.length * 5 + (B.Definitions?.[0].length ?? 0)))[0];
                    if (ClusterID != -1) {
                        Codebook[BestCode.Label] = BestCode;
                        BestCode.Alternatives = [];
                        BestCode.Categories = [];
                        BestCode.Definitions = [];
                        BestCode.Examples = [];
                    }
                    for (var Item of Clusters[ClusterID]) {
                        var Code = Codes[Item.ID];
                        // Only merge codes with high probability
                        if (ClusterID == -1 || Item.Probability <= 0.95) {
                            // Codes that cannot be clustered
                            Codebook[Code.Label] = Code;
                        } else if (Code.Label != BestCode.Label) {
                            // Merge the code
                            BestCode.Alternatives!.push(Code.Label);
                            if ((Code.Categories?.length ?? 0) > 0)
                                BestCode.Categories = [...new Set([...BestCode.Categories!, ...Code.Categories!])];
                            if ((Code.Definitions?.length ?? 0) > 0)
                                BestCode.Definitions = [...new Set([...BestCode.Definitions!, ...Code.Definitions!])];
                            if ((Code.Examples?.length ?? 0) > 0)
                                BestCode.Examples = [...new Set([...BestCode.Examples!, ...Code.Examples!])];
                            if ((Code.Alternatives?.length ?? 0) > 0)
                                BestCode.Alternatives = [...new Set([...BestCode.Alternatives!, ...Code.Alternatives!])];
                            console.log("Merging: " + Code.Label + " into " + BestCode.Label + " with " + (Item.Probability * 100).toFixed(2) + "% chance");
                            Code.Label = "[Merged]";
                        }
                    }
                }
                console.log(`Codes reduced from ${Codes.length} to ${Object.keys(Codebook).length}`);
                Analysis.Codebook = Codebook;
                return ["", ""];
            default:
                return ["", ""];
        }
    }
    /** ParseResponse: Parse the responses from the LLM. */
    public async ParseResponse(Analysis: CodedThreads, Lines: string[], Codes: Code[], ChunkStart: number, Iteration: number): Promise<Record<number, string>> {
        switch (Iteration) {
            case this.GenerateDefinition:
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