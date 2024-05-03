import { ClusterTexts } from "../../utils/embeddings.js";
import { Codebook, Code } from "../../utils/schema.js";
import { MergeCodesByCluster } from "./codebooks.js";
import { CodeConsolidator } from "./consolidator.js";

/** SimpleMerger: Merge codes based on similar names. */
// Note that in this pass, we are not refining names. The shortest name will be adopted.
// So we don't recommend setting a high threshold, because different concepts may be merged.
export class SimpleMerger extends CodeConsolidator {
    /** Threshold: The similarity threshold for merging codes. */
    public Threshold: number;
    /** Penalty: The level penalty for merging codes. */
    public Penalty: number;
    /** UseDefinition: Whether we use definitions in merging (they will be used to inform LLM). */
    public UseDefinition: boolean;
    /** Constructor: Create a new NameMerger. */
    constructor({Threshold = 0.4, Penalty = 0, Looping = false, UseDefinition = false}: {Threshold?: number, Penalty?: number, Looping?: boolean, UseDefinition?: boolean}) {
        super();
        this.Looping = Looping;
        this.Penalty = Penalty;
        this.Threshold = Threshold;
        this.UseDefinition = UseDefinition;
    }
    /** Preprocess: In this case, we do not really use the LLM, so we just merge the codes. */
    public async Preprocess(Codebook: Codebook, Codes: Code[]) {
        var Length = Object.keys(Codebook).length;
        // Categorize the strings
        var Labels = Codes.map(Code => {
            if (this.UseDefinition) {
                var Text = `Label: ${Code.Label}`;
                if ((Code.Definitions?.length ?? 0) > 0) Text += `\nDefinitions:\n${Code.Definitions!.map(Definition => "- " + Definition).join("\n")}`;
                return Text.trim();
            } else {
                return Code.Label;
            }
        });
        var Clusters = await ClusterTexts(Labels, Codes.map(Code => Code.Label), "consolidator", 
            "linkage-jc", "euclidean", "ward", this.Threshold.toString(), this.Penalty.toString(), "0.2");
        // Merge the codes
        var Result = MergeCodesByCluster(Clusters, Codes);
        // Check if we should stop - when nothing is merged
        this.Stopping = Object.keys(Result).length == Length;
        return Result;
    }
}