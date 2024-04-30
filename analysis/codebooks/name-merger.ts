import { ClusterTexts } from "../../utils/embeddings.js";
import { Codebook, Code } from "../../utils/schema.js";
import { MergeCodesByCluster } from "./codebooks.js";
import { CodeConsolidator } from "./consolidator.js";

/** NameMerger: Merge codes based on similar names. */
export class NameMerger extends CodeConsolidator {
    /** Threshold: The similarity threshold for merging codes. */
    public Threshold: number;
    /** Constructor: Create a new NameMerger. */
    constructor(Threshold: number = 0.4) {
        super();
        this.Threshold = Threshold;
    }
    /** BuildPrompts: Build the prompts for the code consolidator. */
    // In this case, we do not really use the LLM, so we just merge the codes
    public async BuildPrompts(Codebook: Codebook, Codes: Code[]) {
        // Categorize the strings
        var Labels = Codes.map(Code => Code.Label);
        var Clusters = await ClusterTexts(Labels, Labels, "consolidator", 
            "linkage-jc", "euclidean", "ward", "0.5", "0");
        // Merge the codes
        return MergeCodesByCluster(Clusters, Codes);
    }
}