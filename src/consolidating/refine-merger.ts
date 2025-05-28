import type { Code, Codebook } from "../schema.js";
import { BaseStep } from "../steps/base-step.js";
import { clusterCodes } from "../utils/embeddings.js";
import { logger } from "../utils/logger.js";

import { mergeCodesByCluster } from "./codebooks.js";
import { DefinitionParser } from "./definition-generator.js";

/** Merge codes based on names and definitions. Then, refine the definitions into one. */
export class RefineMerger extends DefinitionParser {
    protected get _prefix() {
        return logger.prefixed(logger.prefix, "RefineMerger");
    }

    override chunkified = true;
    override looping = false;

    /** The maximum threshold for merging codes. */
    maximum = 0.6;
    /** The minimum threshold for merging codes. */
    minimum = 0.4;
    /** Whether the merging process should be interactive. */
    interactive = false;
    /** Whether we use definitions in merging (used to inform LLM). */
    useDefinition = true;
    /** Whether the merging process should force verb phrases. */
    useVerbPhrases = false;

    /** The name of the consolidator. */
    override get name() {
        return `${super.name} (maximum: ${this.maximum}, minimum: ${this.minimum}, use definition: ${this.useDefinition})`;
    }

    constructor({
        maximum,
        minimum,
        useDefinition,
        useVerbPhrases,
        looping,
        interactive,
    }: {
        maximum?: number;
        minimum?: number;
        useDefinition?: boolean;
        useVerbPhrases?: boolean;
        looping?: boolean;
        interactive?: boolean;
    } = {}) {
        super();
        this.maximum = maximum ?? this.maximum;
        this.minimum = minimum ?? this.minimum;
        this.useDefinition = useDefinition ?? this.useDefinition;
        this.useVerbPhrases = useVerbPhrases ?? this.useVerbPhrases;
        this.looping = looping ?? this.looping;
        this.interactive = interactive ?? this.interactive;
    }

    /** Preprocess the subunits before filtering and chunking. */
    override async preprocess(_codebook: Codebook, codes: Code[]) {
        return await logger.withPrefix(this._prefix, async () => {
            // Only when the code has at least one definition should we merge them
            codes = codes.filter((Code) => (this.useDefinition ? Code.definitions?.length : true));
            if (codes.length === 0) {
                return {};
            }

            const len = codes.length;
            // Cluster codes using text embeddings
            // Combine each code into a string for clustering
            const codeStrings = codes.map((code) =>
                this.useDefinition
                    ? `Label: ${code.label}\nDefinition: ${code.definitions?.join(", ")}`
                    : code.label,
            );
            // Categorize the strings
            const clusters = await clusterCodes(
                codeStrings,
                codes,
                "consolidator",
                "euclidean",
                "ward",
                this.maximum.toString(),
                this.minimum.toString(),
                this.interactive.toString(),
            );
            // If interactive, try to update the parameters
            
            // Merge the codes
            const res = mergeCodesByCluster(clusters, codes);
            // Check if we should stop - when nothing is merged
            this.stopping = Object.keys(res).length === len;
            return res;
        });
    }

    /** Filter the subunits before chunking. */
    override subunitFilter(code: Code): boolean {
        // Only when the code has multiple definitions should we refine them
        return !!(
            super.subunitFilter(code) &&
            (this.useDefinition ? (code.definitions?.length ?? 0) > 1 : code.oldLabels?.length)
        );
    }

    /** Build the prompts for the code consolidator. */
    override buildPrompts(_codebook: Codebook, codes: Code[]): Promise<[string, string]> {
        const { dataset } = BaseStep.Context.get();
        return Promise.resolve([
            `
You are an expert in thematic analysis. You are giving labels and definitions for qualitative codes.
Each code includes one or more concepts and definitions. Each code is independent of another. Never attempt to merge them.
For each code, reflect on the logical relationship between the concepts.
Then, write a combined sentence of criteria covering all the concepts. Use clear and generalizable language and do not introduce unnecessary details. 
Finally, write an accurate ${this.useVerbPhrases ? "verb phrase" : "label"} to best represent the code.
${dataset.researchQuestion}
Always follow the output format:
---
Definitions for each code (${codes.length} in total):
1.
Concepts: {Repeat the input 1}
Relationship: {What is logical relationship between concepts in code 1, or N/A if not applicable}
Criteria: {Who did what, and how for code 1}
${this.useVerbPhrases ? "Phrase" : "Label"}: {The most representative ${this.useVerbPhrases ? "verb phrase" : "label"} for the concepts}
...
${codes.length}. 
Concepts: {Repeat the input ${codes.length}}
Relationship: {What is logical relationship between concepts in code ${codes.length}, or N/A if not applicable}
Criteria: {Who did what, and how for code ${codes.length}}
${this.useVerbPhrases ? "Phrase" : "Label"}: {The most representative ${this.useVerbPhrases ? "verb phrase" : "label"} for the concepts}
---`.trim(),
            codes
                .map((code, idx) =>
                    `
${idx + 1}.
Concepts: ${[code.label, ...(code.oldLabels ?? [])].join(", ")}
${code.definitions?.map((d) => `- ${d}`).join("\n")}`.trim(),
                )
                .join("\n\n"),
        ]);
    }
}
