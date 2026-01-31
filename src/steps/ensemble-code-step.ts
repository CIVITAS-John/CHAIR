/**
 * Ensemble Code Step Module
 *
 * This module provides ensemble-based code selection across multiple coder results.
 * It combines codes from multiple CodeSteps using configurable decision functions
 * or vote thresholds, with optional rolling window aggregation.
 *
 * Key Features:
 * - Depends on multiple prior CodeSteps (AI or human)
 * - User-defined decision functions or simple vote threshold
 * - Rolling window support for aggregate comparison
 * - Full provenance tracking of code sources
 * - Compatible with existing pipeline architecture
 *
 * Decision Strategies:
 * 1. Custom Function: User provides function receiving Map<code, coders[]>
 * 2. Vote Threshold: Keep codes where agreement > threshold (default 0.5)
 * 3. Rolling Window: Optional aggregation across neighboring items
 *
 * Coder Identification:
 * - AI: "{analyzer}-{model}" (e.g., "thematic-analysis-gpt-4")
 * - Human: "human-{name}" (e.g., "human-alice")
 *
 * Pipeline Integration:
 * - Inherits from CodeStep for infrastructure reuse
 * - Depends on multiple CodeStep instances
 * - Provides ensemble results to downstream steps
 */


import type {
    CodedItem,
    CodedThread,
    CodedThreads,
    DataChunk,
    DataItem,
    Dataset,
} from "../schema.js";
import { mergeCodebook } from "../consolidating/codebooks.js";
import { logger } from "../utils/core/logger.js";
import { createRollingWindow } from "../utils/rolling-window.js";

import { CodeStep } from "./code-step.js";

/**
 * Decision function for ensemble code selection
 *
 * Receives a map of codes to the list of coders who assigned them,
 * along with the total number of coders and optional coder weights,
 * and returns the codes to keep.
 *
 * @param codeToCoders - Map of code label to array of coder identifiers
 * @param totalCoders - Total number of coders in the ensemble
 * @param coderWeights - Optional map of coder identifier to normalized weight (sums to 1.0)
 * @returns Array of code labels to include in the ensemble result
 */
export type EnsembleDecisionFunction = (
    codeToCoders: Map<string, string[]>,
    totalCoders: number,
    coderWeights?: Map<string, number>
) => string[];

/**
 * Configuration for EnsembleCodeStep
 */
export interface EnsembleCodeStepConfig<
    TSubunit extends DataItem = DataItem,
    TUnit extends DataChunk<TSubunit> = DataChunk<TSubunit>,
> {
    /**
     * Prior CodeSteps to ensemble with optional custom weighting
     *
     * Can be:
     * - A single CodeStep (weight = 1)
     * - An array of CodeSteps (equal weights = 1/n)
     * - A Map<CodeStep, number> mapping CodeSteps to their weights
     *
     * When using custom weights, they will be normalized to sum to 1.0
     * These steps must have completed execution before ensemble.
     */
    coders:
        | CodeStep<TSubunit, TUnit>
        | CodeStep<TSubunit, TUnit>[]
        | Map<CodeStep<TSubunit, TUnit>, number>;

    /**
     * Custom decision function for code selection
     *
     * If provided, this function receives a map of codes to coders
     * and determines which codes to keep. Mutually exclusive with voteThreshold.
     */
    decisionFunction?: EnsembleDecisionFunction;

    /**
     * Simple vote threshold for code selection (0-1)
     *
     * Alternative to decisionFunction. Keeps codes where
     * (number of agreeing coders / total coders) >= threshold.
     * Default: 0.5 (majority vote)
     */
    voteThreshold?: number;

    /**
     * Size of rolling window for aggregate comparison
     *
     * If specified, aggregates codes across neighboring items
     * before applying the decision function. For each item at position i,
     * codes are collected from items [i-rollingWindow, ..., i, ..., i+rollingWindow].
     *
     * Similar to ReliabilityStep's rolling window feature.
     */
    rollingWindow?: number;

    /**
     * Group name for organizing results
     *
     * Used in consolidation and evaluation steps.
     * Default: "ensemble"
     */
    group?: string;
}

/**
 * Compound key for provenance tracking
 */
type ProvenanceKey = `${string}:${string}:${string}`; // threadId:itemId:code

/**
 * Metadata tracked for ensemble results
 */
interface EnsembleMetadata {
    /** List of all input coder identifiers */
    coderSources: string[];
    /** Map of coder identifier to normalized weight (if custom weights used) */
    coderWeights?: Record<string, number>;
    /** Method used for ensemble decision */
    ensembleMethod: "function" | "threshold";
    /** Vote threshold if used */
    threshold?: number;
    /** Rolling window size if used */
    rollingWindow?: number;
    /** Map of compound key to source coders for analysis */
    codeProvenance: Map<ProvenanceKey, string[]>;
}



/**
 * Default vote threshold decision function
 *
 * Keeps codes where the weighted proportion of agreeing coders meets the threshold.
 * Since weights are always normalized to sum to 1.0, the agreement is already a proportion.
 *
 * @param codeToCoders - Map of codes to coders who assigned them
 * @param threshold - Minimum proportion of agreement required (0-1)
 * @param coderWeights - Map of coder identifier to normalized weight (always present)
 * @returns Codes that meet the threshold
 */
const applyVoteThreshold = (
    codeToCoders: Map<string, string[]>,
    threshold: number,
    coderWeights: Map<string, number>
): string[] => {
    const selected: string[] = [];

    for (const [code, coders] of codeToCoders.entries()) {
        // Calculate weighted agreement: sum of weights for coders who assigned this code
        // Weights are normalized to sum to 1.0, so this gives us a proportion
        const agreement = coders.reduce((sum, coderId) => {
            return sum + (coderWeights.get(coderId) ?? 0);
        }, 0);


        if (agreement > threshold) {
            selected.push(code);
        }
    }

    return selected;
};

/**
 * EnsembleCodeStep - Combines codes from multiple sources using ensemble methods
 *
 * Responsibilities:
 * - Collect coded results from multiple CodeStep dependencies
 * - Apply ensemble decision logic (custom function or vote threshold)
 * - Support rolling window aggregation for context-aware decisions
 * - Track provenance of codes (which coders assigned each code)
 * - Export ensemble results with metadata for transparency
 *
 * Type Parameters:
 * - TSubunit: Type of data item (default: DataItem)
 * - TUnit: Type of data chunk (default: DataChunk<DataItem>)
 *
 * Execution Flow:
 * 1. Collect results from all dependent CodeSteps
 * 2. For each dataset and thread:
 *    a. Extract coded items from all coders
 *    b. Apply rolling window if configured
 *    c. Build code-to-coders mapping
 *    d. Apply decision function or threshold
 *    e. Store ensemble results with provenance
 * 3. Export results to JSON and Excel
 * 4. Build consolidated codebook
 *
 * Pipeline Integration:
 * - Depends on multiple CodeStep instances
 * - Extends BaseStep for pipeline integration
 * - Provides ensemble results to ConsolidateStep
 */
export class EnsembleCodeStep<
    TSubunit extends DataItem = DataItem,
    TUnit extends DataChunk<TSubunit> = DataChunk<TSubunit>,
> extends CodeStep<TSubunit, TUnit> {
    /**
     * Dependencies: CodeSteps providing coded data (cast as any to override parent type)
     */
    override dependsOn: any;

    /**
     * Ensemble-specific configuration
     */
    private ensembleConfig: EnsembleCodeStepConfig<TSubunit, TUnit>;

    /**
     * Metadata for ensemble results
     */
    private metadata: Map<string, EnsembleMetadata> = new Map();

    /**
     * Normalized weights for each coder (maps coder identifier to weight)
     * Weights sum to 1.0 for proper weighted voting
     */
    private coderWeights: Map<string, number> = new Map();

    /**
     * Create a new EnsembleCodeStep
     *
     * @param config - Configuration for ensemble behavior
     */
    constructor(config: EnsembleCodeStepConfig<TSubunit, TUnit>) {
        // Create a minimal CodeStep config - these are dummy values since we override execute()
        super({
            agent: "AI" as const,
            dataset: [], // Will be set from our coders
            group: config.group ?? "ensemble",
            // Provide dummy values for required AI fields
            strategy: [] as any, // Not used - we override execute
            model: "" as any, // Not used - we override execute
        } as any);

        // Validate and store configuration
        this.validateConfig(config);
        this.ensembleConfig = config;

        // Parse and normalize weights
        const { coders, weights } = this.parseCodersAndWeights(config);
        this.coderWeights = weights;
        this.dependsOn = coders;
    }

    /**
     * Validate configuration parameters
     */
    private validateConfig(config: EnsembleCodeStepConfig<TSubunit, TUnit>): void {
        if (config.decisionFunction && config.voteThreshold !== undefined) {
            throw new Error("Cannot specify both decisionFunction and voteThreshold");
        }

        if (config.voteThreshold !== undefined && (config.voteThreshold < 0 || config.voteThreshold > 1)) {
            throw new Error("Vote threshold must be between 0 and 1");
        }

        if (config.rollingWindow !== undefined && config.rollingWindow < 0) {
            throw new Error("Rolling window must be non-negative");
        }
    }

    /**
     * Parse coders configuration and normalize weights
     */
    private parseCodersAndWeights(config: EnsembleCodeStepConfig<TSubunit, TUnit>): {
        coders: CodeStep<TSubunit, TUnit>[];
        weights: Map<string, number>;
    } {
        let codersList: CodeStep<TSubunit, TUnit>[] = [];
        let rawWeights: number[] = [];

        if (Array.isArray(config.coders)) {
            // Array of coders - equal weights
            codersList = config.coders;
            rawWeights = new Array(codersList.length).fill(1);
        } else if (config.coders instanceof CodeStep) {
            // Single coder
            codersList = [config.coders];
            rawWeights = [1];
        } else if (config.coders instanceof Map) {
            // Map with custom weights
            for (const [coder, weight] of config.coders.entries()) {
                codersList.push(coder);
                rawWeights.push(weight);
            }
        } else {
            throw new Error("Invalid coders configuration");
        }

        // Normalize weights to sum to 1.0
        const totalWeight = rawWeights.reduce((sum, w) => sum + w, 0);
        if (totalWeight <= 0) {
            throw new Error("Total weight must be positive");
        }

        const normalizedWeights = rawWeights.map(w => w / totalWeight);

        // Store normalized weights indexed by position (will map to coder IDs during execution)
        const weights = new Map<string, number>();
        normalizedWeights.forEach((weight, index) => {
            weights.set(`coder_${index}`, weight);
        });

        return { coders: codersList, weights };
    }

    /**
     * Collect results from a single coder for a dataset
     */
    private collectCoderResults(
        coder: CodeStep<TSubunit, TUnit>,
        dataset: Dataset<TUnit>,
        coderWeight: number
    ): {
        coderIds: string[];
        weights: Map<string, number>;
        results: Map<string, Map<string, CodedThreads>>;
    } {
        const coderIds: string[] = [];
        const weights = new Map<string, number>();
        const results = new Map<string, Map<string, CodedThreads>>();

        const coderResults = coder.getResult(dataset.name);

        for (const [analyzerName, analyzerResults] of Object.entries(coderResults)) {
            for (const [identifier, codedThreads] of Object.entries(analyzerResults as Record<string, CodedThreads>)) {
                const coderId = coder.getCoderIdentifier(identifier);
                coderIds.push(coderId);
                weights.set(coderId, coderWeight);

                if (!results.has(coderId)) {
                    results.set(coderId, new Map());
                }
                results.get(coderId)!.set(
                    `${analyzerName}-${identifier}`,
                    codedThreads
                );
            }
        }

        return { coderIds, weights, results };
    }

    /**
     * Build metadata for the ensemble results
     */
    private buildMetadata(
        coderSources: string[],
        finalCoderWeights: Map<string, number>
    ): EnsembleMetadata {
        const weightsRecord: Record<string, number> = {};
        for (const [coderId, weight] of finalCoderWeights.entries()) {
            weightsRecord[coderId] = weight;
        }

        return {
            coderSources,
            coderWeights: weightsRecord, // Always present since weights are always normalized
            ensembleMethod: this.ensembleConfig.decisionFunction ? "function" : "threshold",
            threshold: this.ensembleConfig.voteThreshold,
            rollingWindow: this.ensembleConfig.rollingWindow,
            codeProvenance: new Map(),
        };
    }

    /**
     * Process a single item to determine its ensemble codes
     */
    private processItem(
        itemId: string,
        coderItems: Map<string, CodedItem[]>,
        windowMaps: Map<string, Map<string, Set<string>>>,
        finalCoderWeights: Map<string, number>,
        coderSources: string[]
    ): { codes: string[]; codeToCoders: Map<string, string[]> } {
        const codeToCoders = new Map<string, string[]>();

        // If using rolling window, collect codes directly applied to this item by ANY coder
        let directCodes: Set<string> | null = null;
        if (this.ensembleConfig.rollingWindow) {
            directCodes = new Set<string>();
            for (const items of coderItems.values()) {
                const item = items.find(i => i.id === itemId);
                item?.codes?.forEach(code => directCodes!.add(code));
            }
        }

        // Build code-to-coders map
        for (const [coderId, items] of coderItems.entries()) {
            let coderCodes: Set<string>;

            if (this.ensembleConfig.rollingWindow && directCodes !== null) {
                // Get all codes from window for this coder
                const windowCodes = windowMaps.get(coderId)?.get(itemId) || new Set<string>();

                // Only consider codes that appear directly on this item (by ANY coder)
                coderCodes = new Set([...windowCodes].filter(c => directCodes.has(c)));
            } else {
                // Standard item-by-item: use codes directly from this item
                const item = items.find(i => i.id === itemId);
                coderCodes = new Set(item?.codes || []);
            }

            // Add coder to each code's list
            for (const code of coderCodes) {
                if (!codeToCoders.has(code)) {
                    codeToCoders.set(code, []);
                }
                codeToCoders.get(code)!.push(coderId);
            }
        }

        // Apply decision logic
        let selectedCodes: string[];
        if (this.ensembleConfig.decisionFunction) {
            selectedCodes = this.ensembleConfig.decisionFunction(
                codeToCoders,
                coderSources.length,
                finalCoderWeights
            );
        } else {
            const threshold = this.ensembleConfig.voteThreshold ?? 0.5;
            selectedCodes = applyVoteThreshold(
                codeToCoders,
                threshold,
                finalCoderWeights
            );
        }

        return { codes: selectedCodes, codeToCoders };
    }

    /**
     * Process a single thread to build ensemble results
     */
    private processThread(
        threadId: string,
        coderResults: Map<string, Map<string, CodedThreads>>,
        finalCoderWeights: Map<string, number>,
        datasetMetadata: EnsembleMetadata,
        coderSources: string[]
    ): CodedThread {
        // Collect items from all coders for this thread
        const coderItems = new Map<string, CodedItem[]>();
        const itemIds: string[] = [];

        for (const [coderId, coderAnalyzers] of coderResults.entries()) {
            for (const codedThreads of coderAnalyzers.values()) {
                const thread = codedThreads.threads[threadId];
                if (thread) {
                    const items = Object.values(thread.items);
                    coderItems.set(coderId, items);
                    // Collect item IDs from first coder
                    if (itemIds.length === 0) {
                        itemIds.push(...items.map(item => item.id));
                    }
                }
            }
        }

        // Initialize ensemble thread
        const ensembleThread: CodedThread = {
            id: threadId,
            items: {},
            iteration: 0,
            codes: {},
        };

        // Apply rolling window if configured
        const windowMaps = new Map<string, Map<string, Set<string>>>();
        if (this.ensembleConfig.rollingWindow) {
            const windowAggregator = createRollingWindow<CodedItem>(this.ensembleConfig.rollingWindow);
            for (const [coderId, items] of coderItems.entries()) {
                // Use simple aggregate - filtering happens in processItem
                windowMaps.set(
                    coderId,
                    windowAggregator.aggregate(
                        items,
                        item => item.id,
                        item => item.codes || []
                    )
                );
            }
        }

        // Process each item
        for (const itemId of itemIds) {
            const { codes, codeToCoders } = this.processItem(
                itemId,
                coderItems,
                windowMaps,
                finalCoderWeights,
                coderSources
            );

            // Store ensemble codes for this item
            ensembleThread.items[itemId] = {
                id: itemId,
                codes,
            };

            // Track provenance for metadata using compound key
            for (const [code, coders] of codeToCoders.entries()) {
                if (codes.includes(code)) {
                    const key: ProvenanceKey = `${threadId}:${itemId}:${code}`;
                    datasetMetadata.codeProvenance.set(key, coders);
                }
            }

            // Build codes in ensemble thread
            for (const code of codes) {
                if (!ensembleThread.codes[code]) {
                    ensembleThread.codes[code] = { label: code };
                }
            }
        }

        return ensembleThread;
    }

    /**
     * Execute ensemble code selection
     *
     * Overrides parent execute to implement ensemble logic.
     */
    override async execute() {
        // Don't call super.execute() to avoid CodeStep's execution logic
        // We'll handle our own execution

        await logger.withSource(this._prefix, "execute", true, async () => {
            // Validate dependencies have executed
            for (const dep of this.dependsOn) {
                if (!dep.executed) {
                    throw new EnsembleCodeStep.DependencyError(
                        `Dependency ${dep._id} has not executed`
                    );
                }
            }

            // Get datasets from dependencies (should all have the same datasets)
            this._datasets = this.dependsOn[0].datasets;

            logger.info(`Ensemble coding ${this._datasets.length} datasets from ${this.dependsOn.length} coders`);

            // Process each dataset
            for (const dataset of this._datasets) {
                logger.info(`[${dataset.name}] Starting ensemble coding`);

                // Collect all coder identifiers and map weights
                const coderSources: string[] = [];
                const coderResults: Map<string, Map<string, CodedThreads>> = new Map();
                const finalCoderWeights: Map<string, number> = new Map();

                // Calculate weights for each coder in the dependency list
                const tempWeights = Array.from(this.coderWeights.values());

                // Gather results from all coders
                let coderIndex = 0;
                for (const coder of this.dependsOn) {
                    const coderWeight = tempWeights[coderIndex]; // Weights are always present and normalized
                    const { coderIds, weights, results } = this.collectCoderResults(coder, dataset, coderWeight);

                    coderSources.push(...coderIds);
                    for (const [id, weight] of weights) {
                        finalCoderWeights.set(id, weight);
                    }
                    for (const [id, data] of results) {
                        coderResults.set(id, data);
                    }

                    coderIndex++;
                }

                logger.info(`[${dataset.name}] Found ${coderSources.length} coders: ${coderSources.join(", ")}`);

                // Initialize metadata for this dataset
                const datasetMetadata = this.buildMetadata(coderSources, finalCoderWeights);
                this.metadata.set(dataset.name, datasetMetadata);

                // Process each chunk group
                for (const [chunkKey, chunks] of Object.entries(dataset.data)) {
                    logger.info(`[${dataset.name}] Processing chunk ${chunkKey}`);

                    // Initialize ensemble result
                    const ensembleResult: CodedThreads = {
                        threads: {},
                    };

                    // Get thread IDs from first coder (all should have same structure)
                    const firstCoderResults = Array.from(coderResults.values())[0];
                    const firstAnalyzerResults = Array.from(firstCoderResults.values())[0];
                    const threadIds = Object.keys(firstAnalyzerResults.threads);

                    // Process each thread
                    for (const threadId of threadIds) {
                        logger.debug(`[${dataset.name}/${chunkKey}] Processing thread ${threadId}`);

                        const ensembleThread = this.processThread(
                            threadId,
                            coderResults,
                            finalCoderWeights,
                            datasetMetadata,
                            coderSources
                        );

                        ensembleResult.threads[threadId] = ensembleThread;
                    }

                    // Consolidate codebook
                    mergeCodebook(ensembleResult);

                    // Export results using inherited helper method
                    const filename = `${chunkKey.replace(".json", "")}-${this.group}`;

                    // Convert Map to object for JSON serialization
                    const metadataForExport = {
                        ...datasetMetadata,
                        codeProvenance: Object.fromEntries(datasetMetadata.codeProvenance)
                    };

                    await this.exportResults(
                        dataset,
                        this.group,
                        filename,
                        ensembleResult,
                        Object.values(chunks) as TUnit[],
                        metadataForExport
                    );

                    // Store ensemble result as additional analyzer using group name
                    this.storeResult(dataset.name, this.group, filename, ensembleResult);
                }

                logger.success(`[${dataset.name}] Ensemble coding complete`);
            }

            this.executed = true;
        });
    }
}

// Add error types to match parent class pattern
export namespace EnsembleCodeStep {
    export class DependencyError extends Error {
        override name = "EnsembleCodeStep.DependencyError";
    }

    export class UnexecutedError extends Error {
        override name = "EnsembleCodeStep.UnexecutedError";
        constructor() {
            super(`EnsembleCodeStep: Step has not been executed`);
        }
    }

    export class InternalError extends Error {
        override name = "EnsembleCodeStep.InternalError";
        constructor(message: string) {
            super(`EnsembleCodeStep: ${message}`);
        }
    }
}