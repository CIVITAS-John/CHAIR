/**
 * Refined Code Merger Module
 *
 * This module provides a sophisticated consolidator that combines clustering-based merging
 * with LLM-powered refinement. 
 *
 * Two-Stage Process:
 * 1. Preprocess: Cluster codes by label+definition similarity and merge clusters
 * 2. LLM Refinement: Ask LLM to create unified definition and label for merged codes
 *
 * Strategy:
 * - Uses richer embeddings (label + definition) for more accurate clustering
 * - Merges codes within clusters (tracked via oldLabels)
 * - Filters to codes with multiple definitions or oldLabels for LLM processing
 * - LLM sees all merged labels and definitions, produces refined output
 * - Final result: One label, one definition, multiple alternatives
 *
 * Key Differences from SimpleMerger:
 * - Uses definitions in clustering (more context)
 * - Invokes LLM to refine labels and definitions
 * - Higher recommended thresholds (0.4-0.6 vs 0.35)
 * - Only processes codes that need refinement
 *
 * Key Differences from DefinitionGenerator:
 * - Focused on merged codes (has oldLabels or multiple definitions)
 * - Prompts emphasize "relationship between concepts"
 * - Goal is synthesis, not just definition
 *
 * @module consolidating/refine-merger
 */

import type { Code, Codebook } from "../schema.js";
import { BaseStep } from "../steps/base-step.js";
import { clusterCodes } from "../utils/ai/embeddings.js";
import { logger } from "../utils/core/logger.js";

import { mergeCodesByCluster } from "./codebooks.js";
import { DefinitionParser } from "./definition-generator.js";

/**
 * Consolidator that merges codes based on definition similarity and refines them with LLM
 *
 * This consolidator extends DefinitionParser to combine clustering-based merging
 * with LLM-powered refinement of merged codes.
 *
 * Workflow:
 * 1. preprocess(): Cluster codes by label+definition, merge within clusters
 * 2. subunitFilter(): Only process codes with oldLabels or multiple definitions
 * 3. buildPrompts(): Ask LLM to synthesize concepts and create unified definition
 * 4. parseResponse(): Update codes with refined labels and definitions (inherited)
 *
 * Configuration Options:
 * - useDefinition: Whether to include definitions in clustering (recommended: true)
 * - useVerbPhrases: Whether LLM should generate verb phrases instead of noun labels
 * - maximum/minimum: Clustering thresholds (recommended: 0.4-0.6)
 * - looping: Whether to repeat until no more merges (usually false)
 * - interactive: Whether to show dendrogram for threshold selection
 */
export class RefineMerger extends DefinitionParser {
    protected get _prefix() {
        return logger.prefixed(logger.prefix, "RefineMerger");
    }

    /** Process codes in chunks to manage LLM token limits */
    override chunkified = true;

    /** Not looping by default - single pass is usually sufficient */
    override looping = false;

    /**
     * Maximum similarity threshold for clustering
     * Higher than SimpleMerger because definitions provide more context
     * Default: 0.6 (moderately aggressive for definition-based similarity)
     */
    maximum = 0.6;

    /**
     * Minimum similarity threshold for clustering
     * Default: 0.4 (allows codes with related but distinct definitions to cluster)
     */
    minimum = 0.4;

    /**
     * Whether to display interactive dendrogram for threshold selection
     * Shows clustering of codes with definitions for manual threshold tuning
     */
    interactive = false;

    /**
     * Whether to include definitions in clustering embeddings
     * Strongly recommended to be true for RefineMerger
     * Format: "Label: X\nDefinition: Y"
     */
    useDefinition = true;

    /**
     * Whether LLM should generate verb phrases instead of labels
     * - false: Noun phrases like "user frustration"
     * - true: Verb phrases like "expressing frustration"
     * Depends on coding convention preferences
     */
    useVerbPhrases = false;

    /**
     * Descriptive name including threshold configuration
     * Used for logging and debugging
     */
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

    /**
     * Cluster codes by definition similarity and merge within clusters
     *
     * This preprocessing stage performs non-LLM merging before LLM refinement:
     * 1. Filter to codes with definitions (if useDefinition=true)
     * 2. Build strings combining label and definition
     * 3. Cluster using hierarchical clustering on embeddings
     * 4. Merge codes within each cluster
     * 5. Set stopping flag if no merges occurred
     *
     * Filtering Logic:
     * - If useDefinition=true: only process codes with at least one definition
     * - Returns empty codebook if no codes meet criteria
     * - This prevents wasted LLM calls on codes without enough context
     *
     * Stopping Condition:
     * - Compares code count before and after merging
     * - Sets stopping=true if count unchanged (no merges)
     * - Prevents unnecessary LLM calls in looping mode
     *
     * Interactive Mode:
     * - Shows dendrogram with code labels and definitions
     * - Allows visual threshold adjustment
     * - Updates maximum/minimum parameters
     * - Disables after first run
     *
     * @param _codebook - Current codebook (unused, for interface compatibility)
     * @param codes - All codes to potentially merge
     * @returns Updated codebook with merged codes, or empty if no codes qualify
     */
    override async preprocess(_codebook: Codebook, codes: Code[]) {
        return await logger.withPrefix(this._prefix, async () => {
            // Filter to codes with definitions if required
            codes = codes.filter((Code) =>
                this.useDefinition ? (Code.definitions?.length ?? 0) > 0 : true,
            );

            // Return empty codebook if no codes qualify
            if (codes.length === 0) {
                return {};
            }

            // Record starting code count for stopping detection
            const len = codes.length;

            // Build code strings for embedding
            // Include both label and definition for richer semantic clustering
            const codeStrings = codes.map((code) =>
                this.useDefinition
                    ? `Label: ${code.label}\nDefinition: ${code.definitions?.join(", ")}`
                    : code.label,
            );

            // Cluster codes using hierarchical clustering on embeddings
            const clusters = await clusterCodes(
                codeStrings,
                codes,
                "consolidator",  // Embedding purpose
                "euclidean",     // Distance metric
                "ward",          // Linkage method
                this.maximum.toString(),
                this.minimum.toString(),
                this.interactive ? "Setting Thresholds for Refined Merger (With LLM)" : "false",
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

            // Set stopping flag if no merges occurred
            this.stopping = Object.keys(res).length === len;

            return res;
        });
    }

    /**
     * Filter to codes that need LLM refinement
     *
     * This filter is more selective than SimpleMerger to focus LLM calls on codes
     * that actually need refinement after clustering merge.
     *
     * Inclusion Criteria (all must be true):
     * 1. Pass parent class filter (not marked "[Merged]")
     * 2. AND one of:
     *    a. If useDefinition=true: Has multiple definitions (merged from multiple codes)
     *    b. If useDefinition=false: Has oldLabels (was just merged in preprocess)
     *
     * Rationale:
     * - Multiple definitions indicate codes were merged and need synthesis
     * - oldLabels indicates recent merge that needs label/definition refinement
     * - Codes with single definition and no oldLabels don't need LLM processing
     *
     * @param code - Code to evaluate
     * @returns true if code needs LLM refinement, false otherwise
     */
    override subunitFilter(code: Code): boolean {
        return !!(
            super.subunitFilter(code) &&
            (this.useDefinition ? (code.definitions?.length ?? 0) > 1 : code.oldLabels?.length)
        );
    }

    /**
     * Build LLM prompts for synthesizing merged code concepts
     *
     * This prompt is specialized for refining codes that have been merged.
     * Key aspects:
     * - Shows LLM all original labels (via "Concepts: X, Y, Z")
     * - Shows all definitions from merged codes
     * - Asks for relationship analysis between concepts
     * - Requests synthesis into single criteria
     * - Requests refined label or verb phrase
     *
     * Prompt Structure:
     * - System: Expertise declaration, task description, output format
     * - User: Numbered list of codes with concepts and definitions
     *
     * Output Format Expected:
     * 1.
     * Concepts: {original labels}
     * Relationship: {how concepts relate}
     * Criteria: {unified definition}
     * Label/Phrase: {refined label}
     *
     * @param _codebook - Current codebook (unused)
     * @param codes - Codes to refine (already filtered by subunitFilter)
     * @returns [system prompt, user prompt]
     */
    override buildPrompts(_codebook: Codebook, codes: Code[]): Promise<[string, string]> {
        const { dataset } = BaseStep.Context.get();
        return Promise.resolve([
            `
You are an expert in thematic analysis. You are giving labels and definitions for qualitative codes.
Each code includes one or more concepts and definitions. Each code is independent of another. Never attempt to merge them.
For each code, reflect on the logical relationship between the input concepts.
Then, write a combined sentence of criteria covering all the code's input concepts. Use clear and generalizable language and do not introduce unnecessary details. 
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
