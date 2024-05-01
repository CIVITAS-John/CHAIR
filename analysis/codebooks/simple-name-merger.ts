import { ClusterTexts } from "../../utils/embeddings.js";
import { Codebook, Code } from "../../utils/schema.js";
import { MergeCodesByCluster } from "./codebooks.js";
import { CodeConsolidator } from "./consolidator.js";

/** SimpleNameMerger: Merge codes based on similar names. */
// Note that in this pass, we are not refining names. The shortest name will be adopted.
// So we don't recommend setting a high threshold, because different concepts may be merged.
export class SimpleNameMerger extends CodeConsolidator {
    /** Threshold: The similarity threshold for merging codes. */
    public Threshold: number;
    /** Constructor: Create a new NameMerger. */
    constructor(Threshold: number = 0.4) {
        super();
        this.Threshold = Threshold;
    }
    /** Preprocess: In this case, we do not really use the LLM, so we just merge the codes. */
    public async Preprocess(Codebook: Codebook, Codes: Code[]) {
        // Categorize the strings
        var Labels = Codes.map(Code => Code.Label);
        var Clusters = await ClusterTexts(Labels, Labels, "consolidator", 
            "linkage-jc", "euclidean", "ward", this.Threshold.toString(), "0");
        // Merge the codes
        return MergeCodesByCluster(Clusters, Codes);
    }
}