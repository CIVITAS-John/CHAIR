import { ResearchQuestion } from "../../constants.js";
import { ClusterCodes } from "../../utils/embeddings.js";
import { LLMName } from "../../utils/llms.js";
import { Codebook, Code } from "../../utils/schema.js";
import { MergeCodesByCluster } from "./codebooks.js";
import { DefinitionParser } from "./definition-generator.js";

/** RefineMerger: Merge codes based on names and definitions. Then, refine the definitions into one. */
export class RefineMerger extends DefinitionParser {
    /** Maximum: The maximum threshold for merging codes. */
    public Maximum: number;
    /** Minimum: The minimum threshold for merging codes. */
    public Minimum: number;
    /** UseDefinition: Whether we use definitions in merging (they will be used to inform LLM). */
    public UseDefinition: boolean;
    /** Constructor: Create a new NameMerger. */
    constructor({Maximum = 0.6, Minimum = 0.4, Looping = false, UseDefinition = true}: {Maximum?: number, Minimum?: number, Looping?: boolean, UseDefinition?: boolean}) {
        super();
        this.Chunkified = true;
        this.Looping = Looping;
        this.Minimum = Minimum;
        this.Maximum = Maximum;
        this.UseDefinition = UseDefinition;
    }
    /** GetName: Get the name of the consolidator. */
    public GetName(): string {
        return `${super.GetName()} (Maximum ${this.Maximum}, Minimum ${this.Minimum}, Definition ${this.UseDefinition})`;
    }
    /** Preprocess: Preprocess the subunits before filtering and chunking. */
    public async Preprocess(Codebook: Codebook, Codes: Code[]) {
        var Length = Codes.length;
        // Cluster codes using text embeddings
        // Only when the code has more than one definition should we merge them
        Codes = Codes.filter((Code) => this.UseDefinition ? (Code.Definitions?.length ?? 0) > 0 : true);
        if (Codes.length == 0) return {};
        // Combine each code into a string for clustering
        var CodeStrings = Codes.map(Code => {
            if (this.UseDefinition) {
                var Text = `Label: ${Code.Label}`;
                if ((Code.Definitions?.length ?? 0) > 0) Text += `\nDefinition: ${Code.Definitions![0]}`;
                if ((Code.Alternatives?.length ?? 0) > 0) Text += `\nAlternatives: ${Code.Alternatives!.join(", ")}`;
                return Text.trim();
            } else return Code.Label;
        });
        // Categorize the strings
        var Clusters = await ClusterCodes(CodeStrings, Codes, 
            "consolidator", "euclidean", "ward", this.Maximum.toString(), this.Minimum.toString());
        // Merge the codes
        var Result = MergeCodesByCluster(Clusters, Codes);
        // Check if we should stop - when nothing is merged
        this.Stopping = Object.keys(Result).length == Length;
        return Result;
    }
    /** SubunitFilter: Filter the subunits before chunking. */
    public SubunitFilter(Code: Code): boolean {
        // Only when the code has multiple definitions should we refine them
        if (this.UseDefinition)
            return super.SubunitFilter(Code) && (Code.Definitions?.length ?? 0) > 1;
        else return super.SubunitFilter(Code) && (Code.OldLabels?.length ?? 0) > 0;
    }
    /** BuildPrompts: Build the prompts for the code consolidator. */
    // In this case, we do not really use the LLM, so we just merge the codes
    public async BuildPrompts(Codebook: Codebook, Codes: Code[]): Promise<[string, string]> {
        return [`
You are an expert in thematic analysis. 
Each code is a cluster of multiple qualitative sub-code. First, determine the logical relationship between concepts. If a concept includes another, use the broader one. If concepts are parallel, try to cover both concepts.
Write clear and generalizable labels and criteria for each merged code, informed by the context, and without unnecessary specifics or examples.
Find a theory-informed category for each code. Use 2-4 words for categories and avoid over-generalization.
${ResearchQuestion}
Always follow the output format:
---
Categories: 
* {Name some categories you identified from the research question and theoretical lens}

Definitions for each code (${Codes.length} in total):
1. {Repeat the input 1}
Relationship: {The logical relationship between concepts in input 1}
Criteria: {A sentence of consolidated criteria for code 1}
Label: {A consolidated label of code 1}
Category: {2-4 words for code 1}
...
${Codes.length}. {Repeat the input ${Codes.length}}
Relationship: {The logical relationship between concepts in input ${Codes.length}}
Criteria: {A sentence of consolidated criteria for code ${Codes.length}}
Label: {A consolidated label of code ${Codes.length}}
Category: {2-4 words for code ${Codes.length}}
---`.trim(), 
                    Codes.map((Code, Index) => `
${Index + 1}. ${[Code.Label, ...Code.OldLabels ?? []].join(", ") ?? ""}.
${Code.Definitions?.map(Definition => `- ${Definition}`).join("\n")}`.trim()).join("\n\n")];
    }
}