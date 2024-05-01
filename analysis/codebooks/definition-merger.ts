import { ResearchQuestion } from "../../constants.js";
import { ClusterTexts } from "../../utils/embeddings.js";
import { Codebook, Code } from "../../utils/schema.js";
import { MergeCodesByCluster } from "./codebooks.js";
import { DefinitionParser } from "./definition-generator.js";

/** DefinitionMerger: Merge codes based on names and definitions. Then, merge the definitions into one. */
export class DefinitionMerger extends DefinitionParser {
    /** Threshold: The similarity threshold for merging codes. */
    public Threshold: number;
    /** Penalty: The level penalty for merging codes. */
    public Penalty: number;
    /** Constructor: Create a new NameMerger. */
    constructor({Threshold = 0.5, Penalty = 0.05, Looping = false}: {Threshold?: number, Penalty?: number, Looping?: boolean}) {
        super();
        this.Looping = Looping;
        this.Penalty = Penalty;
        this.Threshold = Threshold;
    }
    /** GetChunkSize: Get the chunk size and cursor movement for the LLM. */
    public GetChunkSize(Recommended: number, Remaining: number, Tries: number) {
        return Math.max(Recommended - Tries * 8, 1);
    }
    /** Preprocess: Preprocess the subunits before filtering and chunking. */
    public async Preprocess(Codebook: Codebook, Codes: Code[]) {
        var Length = Codes.length;
        Codes.forEach(Code => delete Code.OldLabels);
        // Cluster codes using text embeddings
        // Only when the code has more than one definition should we merge them
        Codes = Codes.filter(Code => (Code.Definitions?.length ?? 0) >= 1);
        // Combine each code into a string for clustering
        var CodeStrings = Codes.map(Code => {
            var Text = `Label: ${Code.Label}`;
            if ((Code.Definitions?.length ?? 0) > 0) Text += `\nDefinition: ${Code.Definitions![0]}`;
            return Text.trim();
        });
        // Categorize the strings
        var Clusters = await ClusterTexts(CodeStrings, Codes.map(Code => Code.Label), "consolidator", 
            "linkage-jc", "euclidean", "ward", this.Threshold.toString(), this.Penalty.toString());
        // Merge the codes
        var Result = MergeCodesByCluster(Clusters, Codes);
        // Check if we should stop - when nothing is merged
        this.Stopping = Object.keys(Result).length == Length;
        return Result;
    }
    /** SubunitFilter: Filter the subunits before chunking. */
    public SubunitFilter(Code: Code): boolean {
        // Only when the code has multiple definitions should we refine them
        return super.SubunitFilter(Code) && (Code.Definitions?.length ?? 0) > 1;
    }
    /** BuildPrompts: Build the prompts for the code consolidator. */
    // In this case, we do not really use the LLM, so we just merge the codes
    public async BuildPrompts(Codebook: Codebook, Codes: Code[]): Promise<[string, string]> {
        return [`
You are an expert in thematic analysis. 
Each code is merged from multiple ones. Consolidate into a single label and criteria that covers all concepts. Labels and criteria should be clear and generalizable, informed by the context, and without unnecessary specifics or examples.
Group each code into a theory-informed category. Use 2-4 words for categories and avoid over-generalization (e.g. "social interaction" instead of "interaction", "communication approach" instead of "communication").
${ResearchQuestion}
Always follow the output format:
---
Thoughts: 
* {Name some categories you identified from the research question and theoretical lens}

Definitions for each code (${Codes.length} in total):
1.
Label: {A consolidated label of code 1}
Criteria: {Consolidated criteria of code 1}
Category: {2-4 words for code 1}
...
${Codes.length}.
Label: {A consolidated label of code ${Codes.length}}
Criteria: {Consolidated criteria of code ${Codes.length}}
Category: {2-4 words for code ${Codes.length}}
---`.trim(), 
                    Codes.map((Code, Index) => `
${Index + 1}. ${[Code.Label, ...Code.OldLabels ?? []].join(", ") ?? ""}.
${Code.Definitions?.map(Definition => `- ${Definition}`).join("\n")}`.trim()).join("\n\n")];
    }
}