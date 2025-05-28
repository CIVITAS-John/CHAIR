import type { Code, Codebook } from "../schema.js";
import { clusterCodes } from "../utils/embeddings.js";
import { logger } from "../utils/logger.js";

import { mergeCodesByCluster } from "./codebooks.js";
import { CodeConsolidator } from "./consolidator.js";
/**
 * Merge codes based on similar names.
 *
 * Note that in this pass, we are not refining names. The shortest name will be adopted.
 * So we don't recommend setting a high threshold, because different concepts may be merged.
 */
export class SimpleMerger extends CodeConsolidator {
    protected get _prefix() {
        return logger.prefixed(logger.prefix, "SimpleMerger");
    }

    override looping = false;

    /** The maximum threshold for merging codes. */
    maximum = 0.35;
    /** The minimum threshold for merging codes. */
    minimum = 0.35;
    /** Whether the merging process should be interactive. */
    interactive = false;
    /** Whether we use definitions in merging (used to inform LLM). */
    useDefinition = false;

    constructor({
        maximum,
        minimum,
        useDefinition,
        looping,
        interactive,
    }: {
        maximum?: number;
        minimum?: number;
        useDefinition?: boolean;
        looping?: boolean;
        interactive?: boolean;
    } = {}) {
        super();
        this.maximum = maximum ?? this.maximum;
        this.minimum = minimum ?? this.minimum;
        this.useDefinition = useDefinition ?? this.useDefinition;
        this.looping = looping ?? this.looping;
        this.interactive = interactive ?? this.interactive;
    }

    /** In this case, we do not really use the LLM, so we just merge the codes. */
    override async preprocess(codebook: Codebook, codes: Code[]) {
        return await logger.withPrefix(this._prefix, async () => {
            const len = Object.keys(codebook).length;
            // Categorize the strings
            const labels = codes.map((code) =>
                this.useDefinition
                    ? `Label: ${code.label}${code.definitions?.length ? `\nDefinitions:\n${code.definitions.map((d) => `- ${d}`).join("\n")}` : ""}`.trim()
                    : code.label,
            );
            const clusters = await clusterCodes(
                labels,
                codes,
                "consolidator",
                "euclidean",
                "ward",
                this.maximum.toString(),
                this.minimum.toString(),
                this.interactive ? "Setting Thresholds for Simple Merger (Without LLM)" : "false",
            );
            // If interactive, try to update the parameters
            if (this.interactive && clusters.param.length > 0) {
                this.maximum = clusters.param[0];
                this.minimum = clusters.param[1];
                this.interactive = false; // Stop the interactive mode after the first run
                logger.info(
                    `Updated parameters to maximum: ${this.maximum}, minimum: ${this.minimum}`,
                );
            }
            // Merge the codes
            const res = mergeCodesByCluster(clusters.res, codes);
            // Check if we should stop - when nothing is merged
            this.stopping = Object.keys(res).length === len;
            return res;
        });
    }
}
