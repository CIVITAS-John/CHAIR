import { ResearchQuestion } from "../../constants.js";
import { ClusterTexts } from "../../utils/embeddings.js";
import { Codebook, Code, GetCategories } from "../../utils/schema.js";
import { MergeCategoriesByCluster, MergeCodesByCluster, UpdateCategories } from "./codebooks.js";
import { CodeConsolidator } from "./consolidator.js";

/** CategoryNameMerger: Merge categories based on similar names. */
// Note that in this pass, we are not refining names. The shortest name will be adopted.
// So we don't recommend setting a high threshold, because different concepts may be merged.
export class CategoryNameMerger extends CodeConsolidator {
    /** Threshold: The similarity threshold for merging codes. */
    public Threshold: number;
    /** Constructor: Create a new CategoryNameMerger. */
    constructor(Threshold: number = 0.4) {
        super();
        this.Threshold = Threshold;
    }
    /** SubunitFilter: Filter the subunits before chunking. */
    public SubunitFilter(Code: Code): boolean {
        return super.SubunitFilter(Code) && (Code.Categories?.length ?? 0) > 0;
    }
    /** Preprocess: Preprocess the subunits before chunking. */
    public async Preprocess(Codebook: Codebook, Codes: Code[]): Promise<Code[]> {
        if (Codes.length == 0) return [];
        // Collect the existing categories from the codebook
        var Categories = GetCategories(Codebook);
        // Cluster categories using text embeddings
        var Clusters = await ClusterTexts(Categories, Categories, "consolidated", 
            "linkage-jc", "euclidean", "ward", this.Threshold.toString(), "0"
        );
        // Update the categories
        MergeCategoriesByCluster(Clusters, Categories, Codes, true);
        console.log(`Statistics: Categories merged from ${Categories.length} to ${GetCategories(Codebook).length}`);
        return Codes;
    }
}