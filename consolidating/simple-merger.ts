import type { Code, Codebook } from "../schema";
import type { IDStrFunc } from "../steps/base-step";
import type { EmbedderObject } from "../utils/embeddings";
import { clusterCodes } from "../utils/embeddings";

import { mergeCodesByCluster } from "./codebooks";
import { CodeConsolidator } from "./consolidator";
/**
 * Merge codes based on similar names.
 *
 * Note that in this pass, we are not refining names. The shortest name will be adopted.
 * So we don't recommend setting a high threshold, because different concepts may be merged.
 */
export class SimpleMerger extends CodeConsolidator {
    protected _idStr: IDStrFunc;

    override looping = false;

    /** The maximum threshold for merging codes. */
    maximum = 0.35;
    /** The minimum threshold for merging codes. */
    minimum = 0.35;
    /** Whether we use definitions in merging (used to inform LLM). */
    useDefinition = false;

    constructor(
        idStr: IDStrFunc,
        /** The embedder object for the consolidator. */
        public embedder: EmbedderObject,
        {
            maximum,
            minimum,
            useDefinition,
            looping,
        }: {
            maximum?: number;
            minimum?: number;
            useDefinition?: boolean;
            looping?: boolean;
        } = {},
    ) {
        super();
        this._idStr = (mtd?: string) => idStr(`SimpleMerger${mtd ? `#${mtd}` : ""}`);
        this.maximum = maximum ?? this.maximum;
        this.minimum = minimum ?? this.minimum;
        this.useDefinition = useDefinition ?? this.useDefinition;
        this.looping = looping ?? this.looping;
    }

    /** In this case, we do not really use the LLM, so we just merge the codes. */
    override async preprocess(codebook: Codebook, codes: Code[]) {
        const len = Object.keys(codebook).length;
        // Categorize the strings
        const labels = codes.map((code) =>
            this.useDefinition
                ? `Label: ${code.label}${code.definitions?.length ? `\nDefinitions:\n${code.definitions.map((d) => `- ${d}`).join("\n")}` : ""}`.trim()
                : code.label,
        );
        const clusters = await clusterCodes(
            this._idStr,
            this.embedder,
            labels,
            codes,
            "consolidator",
            "euclidean",
            "ward",
            this.maximum.toString(),
            this.minimum.toString(),
        );
        // Merge the codes
        const res = mergeCodesByCluster(this._idStr, clusters, codes);
        // Check if we should stop - when nothing is merged
        this.stopping = Object.keys(res).length === len;
        return res;
    }
}
