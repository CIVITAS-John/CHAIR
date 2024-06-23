import { ResearchQuestion } from "../constants.js";
import { ClusterCodes } from "../utils/embeddings.js";
import { Codebook, Code } from "../utils/schema.js";
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
                // if ((Code.Alternatives?.length ?? 0) > 0) Text += `\nAlternatives: ${Code.Alternatives!.join(", ")}`;
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
You are an expert in thematic analysis. You are giving labels and definitions for qualitative codes.
Each code includes one or more concepts and definitions. Each code is independent of another and please do not merge them.
Determine the logical relationship between concepts within each code, such as inclusion, parallel, or intersection.
Write clear and generalizable criteria for each code and do not introduce unnecessary details. Then, write an accurate label for the combined concept.
${ResearchQuestion}
Always follow the output format:
---
Definitions for each code (${Codes.length} in total):
1.
Concepts: {Repeat the input 1}
Relationship: {What is logical relationship between concepts in code 1, or N/A if not applicable}
Criteria: {Who did what, and how for code 1}
Label: {A consolidated label of code 1}
...
${Codes.length}. 
Concepts: {Repeat the input ${Codes.length}}
Relationship: {What is logical relationship between concepts in code ${Codes.length}, or N/A if not applicable}
Criteria: {Who did what, and how for code ${Codes.length}}
Label: {A consolidated label of code ${Codes.length}}
---`.trim(), 
                    Codes.map((Code, Index) => `
${Index + 1}.
Concepts: ${[Code.Label, ...Code.OldLabels ?? []].join(", ") ?? ""}
${Code.Definitions?.map(Definition => `- ${Definition}`).join("\n")}`.trim()).join("\n\n")];
    }
}