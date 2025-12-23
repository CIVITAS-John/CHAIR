/**
 * Simple Code Merger Module
 *
 * This module provides a clustering-based code consolidator that merges codes with
 * similar labels without using LLM refinement. It uses text embeddings and hierarchical
 * clustering to identify groups of similar codes.
 *
 * Strategy:
 * - Embeds code labels (optionally with definitions) using text embeddings
 * - Clusters codes using hierarchical clustering (euclidean distance + ward linkage)
 * - Merges codes within each cluster into the shortest label
 * - No LLM calls - pure algorithmic merging
 *
 * Use Cases:
 * - Initial deduplication of obviously similar codes
 * - Pre-processing before LLM-based refinement
 * - Quick merging when LLM access is limited
 *
 * Threshold Guidance:
 * - Lower threshold (0.2-0.4): More conservative, fewer merges, safer
 * - Higher threshold (0.5-0.7): More aggressive, more merges, riskier
 * - Recommended: 0.35 for label-only, 0.5 for label+definition
 * - Interactive mode allows manual threshold calibration
 *
 * Important Limitations:
 * - Does NOT refine or improve labels - just picks shortest
 * - May merge semantically different codes with similar names
 * - No context understanding - purely string similarity
 * - Recommended as first pass, followed by RefineMerger
 *
 * @module consolidating/simple-merger
 */

import type { Code, Codebook } from "../schema.js";
import { clusterCodes } from "../utils/ai/embeddings.js";
import { logger } from "../utils/core/logger.js";

import { mergeCodesByCluster } from "./codebooks.js";
import { CodeConsolidator } from "./consolidator.js";

/**
 * Consolidator that merges codes based on label similarity using clustering
 *
 * This consolidator performs non-LLM merging by:
 * 1. Embedding code labels (with optional definitions)
 * 2. Clustering embeddings using hierarchical clustering
 * 3. Merging codes within each cluster
 * 4. Adopting the shortest label as the canonical name
 *
 * Looping Behavior:
 * - Can be configured to loop until no more merges occur
 * - Sets stopping=true when merging produces no change
 * - Useful for iterative deduplication
 *
 * Interactive Mode:
 * - Displays dendrogram for manual threshold selection
 * - Updates maximum/minimum thresholds based on user input
 * - Automatically disables after first run
 *
 * Threshold Parameters:
 * - maximum: Upper bound for clustering (controls max cluster size)
 * - minimum: Lower bound for clustering (controls min similarity to cluster)
 * - Both thresholds control hierarchical clustering cutoff
 */
export class SimpleMerger extends CodeConsolidator {
    protected get _prefix() {
        return logger.prefixed(logger.prefix, "SimpleMerger");
    }

    /** Not looping by default - runs once unless configured otherwise */
    override looping = false;

    /**
     * Maximum similarity threshold for clustering
     * Higher values create larger clusters (more aggressive merging)
     * Default: 0.35 (conservative for label-only similarity)
     */
    maximum = 0.35;

    /**
     * Minimum similarity threshold for clustering
     * Lower values allow more dissimilar codes into clusters
     * Typically set equal to maximum for simple cutoff
     */
    minimum = 0.35;

    /**
     * Whether to display interactive dendrogram for threshold selection
     * When true, shows clustering visualization and allows manual threshold adjustment
     * Automatically disables after first run
     */
    interactive = false;

    /**
     * Whether to include definitions in similarity calculation
     * - false: Only use code labels (faster, more conservative)
     * - true: Use "Label: X\nDefinitions:\n- Y" format (slower, more accurate)
     * Recommended: false for initial pass, true for second pass
     */
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

    /**
     * Perform clustering-based code merging
     *
     * This is the main logic for SimpleMerger. No LLM is used - instead, codes are:
     * 1. Converted to strings (label only or label+definitions)
     * 2. Embedded using text embedding model
     * 3. Clustered using hierarchical clustering
     * 4. Merged within each cluster using mergeCodesByCluster
     *
     * Stopping Condition:
     * - Compares codebook size before and after merging
     * - Sets stopping=true if no codes were merged
     * - Prevents infinite loops in looping mode
     *
     * Interactive Mode:
     * - On first run with interactive=true, shows dendrogram
     * - User adjusts thresholds visually
     * - Updated thresholds saved and interactive mode disabled
     *
     * Clustering Parameters:
     * - "consolidator": Embedding type for code consolidation
     * - "euclidean": Distance metric for hierarchical clustering
     * - "ward": Linkage method for hierarchical clustering
     * - maximum/minimum: Threshold strings passed to clustering
     *
     * @param codebook - Current codebook (used to measure stopping condition)
     * @param codes - Codes to cluster and merge
     * @returns Updated codebook with merged codes
     */
    override async preprocess(codebook: Codebook, codes: Code[]) {
        return await logger.withPrefix(this._prefix, async () => {
            // Record starting codebook size to detect if any merging occurred
            const len = Object.keys(codebook).length;

            // Build label strings for embedding
            const labels = codes.map((code) =>
                this.useDefinition
                    ? `Label: ${code.label}${code.definitions?.length ? `\nDefinitions:\n${code.definitions.map((d) => `- ${d}`).join("\n")}` : ""}`.trim()
                    : code.label,
            );

            // Cluster codes using hierarchical clustering on embeddings
            const clusters = await clusterCodes(
                labels,
                codes,
                "consolidator",  // Embedding purpose
                "euclidean",     // Distance metric
                "ward",          // Linkage method
                this.maximum.toString(),
                this.minimum.toString(),
                this.interactive ? "Setting Thresholds for Simple Merger (Without LLM)" : "false",
            );

            // Update thresholds if interactive mode returned new parameters
            if (this.interactive && clusters.param.length > 0) {
                this.maximum = clusters.param[0];
                this.minimum = clusters.param[1];
                this.interactive = false; // Disable interactive mode after first use
                logger.info(
                    `Updated parameters to maximum: ${this.maximum}, minimum: ${this.minimum}`,
                );
            }

            // Merge codes within each cluster
            const res = mergeCodesByCluster(clusters.res, codes);

            // Set stopping flag if no codes were merged (codebook size unchanged)
            this.stopping = Object.keys(res).length === len;

            return res;
        });
    }
}
