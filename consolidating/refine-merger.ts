import { ResearchQuestion } from "../constants.js";
import { ClusterCodes } from "../utils/embeddings.js";
import type { Code, Codebook } from "../utils/schema.js";

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
    /** UseVerbPhrases: Whether the merging process should force verb phrases. */
    public UseVerbPhrases: boolean;
    /** Constructor: Create a new NameMerger. */
    constructor({
        Maximum = 0.6,
        Minimum = 0.4,
        Looping = false,
        UseDefinition = true,
        UseVerbPhrases = false,
    }: {
        Maximum?: number;
        Minimum?: number;
        Looping?: boolean;
        UseDefinition?: boolean;
        UseVerbPhrases?: boolean;
    }) {
        super();
        this.Chunkified = true;
        this.Looping = Looping;
        this.Minimum = Minimum;
        this.Maximum = Maximum;
        this.UseDefinition = UseDefinition;
        this.UseVerbPhrases = UseVerbPhrases;
    }
    /** GetName: Get the name of the consolidator. */
    public GetName(): string {
        return `${super.GetName()} (Maximum ${this.Maximum}, Minimum ${this.Minimum}, Definition ${this.UseDefinition})`;
    }
    /** Preprocess: Preprocess the subunits before filtering and chunking. */
    public async Preprocess(Codebook: Codebook, Codes: Code[]) {
        const Length = Codes.length;
        // Cluster codes using text embeddings
        // Only when the code has more than one definition should we merge them
        Codes = Codes.filter((Code) =>
            this.UseDefinition ? (Code.Definitions?.length ?? 0) > 0 : true,
        );
        if (Codes.length == 0) {
            return {};
        }
        // Combine each code into a string for clustering
        const CodeStrings = Codes.map((Code) => {
            if (this.UseDefinition) {
                let Text = `Label: ${Code.Label}`;
                if ((Code.Definitions?.length ?? 0) > 0) {
                    Text += `\nDefinition: ${Code.Definitions![0]}`;
                }
                // if ((Code.Alternatives?.length ?? 0) > 0) Text += `\nAlternatives: ${Code.Alternatives!.join(", ")}`;
                return Text.trim();
            }
            return Code.Label;
        });
        // Categorize the strings
        const Clusters = await ClusterCodes(
            CodeStrings,
            Codes,
            "consolidator",
            "euclidean",
            "ward",
            this.Maximum.toString(),
            this.Minimum.toString(),
        );
        // Merge the codes
        const Result = MergeCodesByCluster(Clusters, Codes);
        // Check if we should stop - when nothing is merged
        this.Stopping = Object.keys(Result).length == Length;
        return Result;
    }
    /** SubunitFilter: Filter the subunits before chunking. */
    public SubunitFilter(Code: Code): boolean {
        // Only when the code has multiple definitions should we refine them
        if (this.UseDefinition) {
            return super.SubunitFilter(Code) && (Code.Definitions?.length ?? 0) > 1;
        }
        return super.SubunitFilter(Code) && (Code.OldLabels?.length ?? 0) > 0;
    }
    /** BuildPrompts: Build the prompts for the code consolidator. */
    // In this case, we do not really use the LLM, so we just merge the codes
    public async BuildPrompts(Codebook: Codebook, Codes: Code[]): Promise<[string, string]> {
        return [
            `
You are an expert in thematic analysis. You are giving labels and definitions for qualitative codes.
Each code includes one or more concepts and definitions. Each code is independent of another. Never attempt to merge them.
For each code, reflect on the logical relationship between the concepts.
Then, write a combined sentence of criteria covering all the concepts. Use clear and generalizable language and do not introduce unnecessary details. 
Finally, write an accurate ${this.UseVerbPhrases ? "verb phrase" : "label"} to best represent the code.
${ResearchQuestion}
Always follow the output format:
---
Definitions for each code (${Codes.length} in total):
1.
Concepts: {Repeat the input 1}
Relationship: {What is logical relationship between concepts in code 1, or N/A if not applicable}
Criteria: {Who did what, and how for code 1}
${this.UseVerbPhrases ? "Phrase" : "Label"}: {The most representative ${this.UseVerbPhrases ? "verb phrase" : "label"} for the concepts}
...
${Codes.length}. 
Concepts: {Repeat the input ${Codes.length}}
Relationship: {What is logical relationship between concepts in code ${Codes.length}, or N/A if not applicable}
Criteria: {Who did what, and how for code ${Codes.length}}
${this.UseVerbPhrases ? "Phrase" : "Label"}: {The most representative ${this.UseVerbPhrases ? "verb phrase" : "label"} for the concepts}
---`.trim(),
            Codes.map((Code, Index) =>
                `
${Index + 1}.
Concepts: ${[Code.Label, ...(Code.OldLabels ?? [])].join(", ") ?? ""}
${Code.Definitions?.map((Definition) => `- ${Definition}`).join("\n")}`.trim(),
            ).join("\n\n"),
        ];
    }
}
