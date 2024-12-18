import { ClusterCodes } from "../utils/embeddings.js";
import type { Code, Codebook } from "../utils/schema.js";

import { MergeCodesByCluster } from "./codebooks.js";
import { CodeConsolidator } from "./consolidator.js";

/** SimpleMerger: Merge codes based on similar names. */
// Note that in this pass, we are not refining names. The shortest name will be adopted.
// So we don't recommend setting a high threshold, because different concepts may be merged.
export class SimpleMerger extends CodeConsolidator {
    /** Maximum: The maximum threshold for merging codes. */
    public Maximum: number;
    /** Minimum: The minimum threshold for merging codes. */
    public Minimum: number;
    /** UseDefinition: Whether we use definitions in merging (they will be used to inform LLM). */
    public UseDefinition: boolean;
    /** Constructor: Create a new NameMerger. */
    constructor({
        Maximum = 0.35,
        Minimum = 0.35,
        Looping = false,
        UseDefinition = false,
    }: {
        Maximum?: number;
        Minimum?: number;
        Looping?: boolean;
        UseDefinition?: boolean;
    }) {
        super();
        this.Looping = Looping;
        this.Maximum = Maximum;
        this.Minimum = Minimum;
        this.UseDefinition = UseDefinition;
    }
    /** Preprocess: In this case, we do not really use the LLM, so we just merge the codes. */
    public async Preprocess(Codebook: Codebook, Codes: Code[]) {
        const Length = Object.keys(Codebook).length;
        // Categorize the strings
        const Labels = Codes.map((Code) => {
            if (this.UseDefinition) {
                let Text = `Label: ${Code.Label}`;
                if ((Code.Definitions?.length ?? 0) > 0) {
                    Text += `\nDefinitions:\n${Code.Definitions!.map((Definition) => `- ${Definition}`).join("\n")}`;
                }
                return Text.trim();
            }
            return Code.Label;
        });
        const Clusters = await ClusterCodes(Labels, Codes, "consolidator", "euclidean", "ward", this.Maximum.toString(), this.Minimum.toString());
        // Merge the codes
        const Result = MergeCodesByCluster(Clusters, Codes);
        // Check if we should stop - when nothing is merged
        this.Stopping = Object.keys(Result).length == Length;
        return Result;
    }
}
