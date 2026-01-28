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
 * 2. Vote Threshold: Keep codes where agreement >= threshold (default 0.5)
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

import { join } from "path";
import { writeFileSync } from "fs";

import type {
    CodedItem,
    CodedThread,
    CodedThreads,
    DataChunk,
    DataItem,
} from "../schema.js";
import { mergeCodebook } from "../consolidating/codebooks.js";
import { exportChunksForCoding } from "../utils/io/export.js";
import { ensureFolder } from "../utils/io/file.js";
import { logger } from "../utils/core/logger.js";

import { BaseStep } from "./base-step.js";
import { CodeStep } from "./code-step.js";

/**
 * Decision function for ensemble code selection
 *
 * Receives a map of codes to the list of coders who assigned them,
 * along with the total number of coders, and returns the codes to keep.
 *
 * @param codeToCoders - Map of code label to array of coder identifiers
 * @param totalCoders - Total number of coders in the ensemble
 * @returns Array of code labels to include in the ensemble result
 */
export type EnsembleDecisionFunction = (
    codeToCoders: Map<string, string[]>,
    totalCoders: number
) => string[];

/**
 * Configuration for EnsembleCodeStep
 */
export interface EnsembleCodeStepConfig<
    TSubunit extends DataItem = DataItem,
    TUnit extends DataChunk<TSubunit> = DataChunk<TSubunit>,
> {
    /**
     * Prior CodeSteps to ensemble
     *
     * Can be a single CodeStep or array of multiple coding sources.
     * These steps must have completed execution before ensemble.
     */
    coders: CodeStep<TSubunit, TUnit> | CodeStep<TSubunit, TUnit>[];

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
 * Metadata tracked for ensemble results
 */
interface EnsembleMetadata {
    /** List of all input coder identifiers */
    coderSources: string[];
    /** Method used for ensemble decision */
    ensembleMethod: "function" | "threshold";
    /** Vote threshold if used */
    threshold?: number;
    /** Rolling window size if used */
    rollingWindow?: number;
    /** Map of codes to their source coders for analysis */
    codeProvenance: Record<string, Record<string, string[]>>;
}

/**
 * Apply rolling window aggregation to coded items
 *
 * Aggregates codes within a window around each item position.
 * Edge cases (start/end of list) use only available items.
 *
 * @param items - Ordered list of coded items
 * @param windowSize - Number of items to include on each side
 * @returns Map of item ID to aggregated codes for that window
 */
const applyRollingWindow = (
    items: CodedItem[],
    windowSize: number
): Map<string, Set<string>> => {
    const windowCodes = new Map<string, Set<string>>();

    for (let i = 0; i < items.length; i++) {
        const windowStart = Math.max(0, i - windowSize);
        const windowEnd = Math.min(items.length - 1, i + windowSize);

        const aggregatedCodes = new Set<string>();
        for (let j = windowStart; j <= windowEnd; j++) {
            const codes = items[j].codes || [];
            codes.forEach(code => aggregatedCodes.add(code));
        }

        windowCodes.set(items[i].id, aggregatedCodes);
    }

    return windowCodes;
};

/**
 * Build coder identifier including model information
 *
 * Creates consistent identifiers for tracking code sources:
 * - AI coders: "{analyzer}-{model}"
 * - Human coders: "human-{coderName}"
 *
 * @param group - Coder group (e.g., "human", "ai", or analyzer name)
 * @param identifier - Specific identifier within the group
 * @returns Formatted coder identifier
 */
const buildCoderIdentifier = (group: string, identifier: string): string => {
    if (group === "human") {
        // Extract coder name from identifier (might be just the name or include other info)
        const coderName = identifier.split("-")[0] || identifier;
        return `human-${coderName}`;
    } else {
        // For AI, identifier typically includes chunk and model info
        // Extract model name from patterns like "chunk-gpt-4-suffix"
        const parts = identifier.split("-");
        const modelParts = [];
        for (let i = 1; i < parts.length; i++) {
            // Skip the first part (usually "chunk" or similar)
            if (parts[i] && !parts[i].match(/^\d+$/)) {
                modelParts.push(parts[i]);
            }
        }
        const model = modelParts.join("-") || identifier;
        return `${group}-${model}`;
    }
};

/**
 * Default vote threshold decision function
 *
 * Keeps codes where the proportion of agreeing coders meets the threshold.
 *
 * @param codeToCoders - Map of codes to coders who assigned them
 * @param totalCoders - Total number of coders
 * @param threshold - Minimum proportion of agreement required (0-1)
 * @returns Codes that meet the threshold
 */
const applyVoteThreshold = (
    codeToCoders: Map<string, string[]>,
    totalCoders: number,
    threshold: number
): string[] => {
    const selected: string[] = [];

    for (const [code, coders] of codeToCoders.entries()) {
        const agreement = coders.length / totalCoders;
        if (agreement >= threshold) {
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
> extends BaseStep {
    /**
     * Dependencies: CodeSteps providing coded data
     */
    override dependsOn: CodeStep<TSubunit, TUnit>[];

    /**
     * Ensemble-specific configuration
     */
    private ensembleConfig: EnsembleCodeStepConfig<TSubunit, TUnit>;

    /**
     * Metadata for ensemble results
     */
    private metadata: Map<string, EnsembleMetadata> = new Map();

    /**
     * Results storage for ensemble outputs
     */
    private ensembleResults = new Map<string, Record<string, Record<string, CodedThreads>>>();

    /**
     * Group name for organizing results
     */
    group: string;

    /**
     * Create a new EnsembleCodeStep
     *
     * @param config - Configuration for ensemble behavior
     */
    constructor(config: EnsembleCodeStepConfig<TSubunit, TUnit>) {
        super();

        // Store ensemble-specific config
        this.ensembleConfig = config;
        this.group = config.group ?? "ensemble";

        // Set dependencies from coders
        this.dependsOn = Array.isArray(config.coders) ? config.coders : [config.coders];

        // Validate configuration
        if (config.decisionFunction && config.voteThreshold !== undefined) {
            throw new Error("Cannot specify both decisionFunction and voteThreshold");
        }
    }

    /**
     * Get ensemble results for a dataset
     *
     * @param dataset - Name of the dataset
     * @returns Ensemble results for the dataset
     */
    getResult(dataset: string) {
        if (!this.executed || !this.ensembleResults.size) {
            throw new EnsembleCodeStep.UnexecutedError();
        }
        if (!this.ensembleResults.has(dataset)) {
            throw new EnsembleCodeStep.InternalError(
                `Dataset ${dataset} not found`
            );
        }
        return this.ensembleResults.get(dataset) ?? {};
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
            const datasets = this.dependsOn[0].datasets;

            logger.info(`Ensemble coding ${datasets.length} datasets from ${this.dependsOn.length} coders`);

            // Process each dataset
            for (const dataset of datasets) {
                logger.info(`[${dataset.name}] Starting ensemble coding`);

                // Collect all coder identifiers
                const coderSources: string[] = [];
                const coderResults: Map<string, Map<string, CodedThreads>> = new Map();

                // Gather results from all coders
                for (const coder of this.dependsOn) {
                    const results = coder.getResult(dataset.name);

                    // Store results indexed by coder
                    for (const [analyzerName, analyzerResults] of Object.entries(results)) {
                        for (const [identifier, codedThreads] of Object.entries(analyzerResults)) {
                            const coderId = buildCoderIdentifier(
                                coder.group || analyzerName,
                                identifier
                            );
                            coderSources.push(coderId);

                            if (!coderResults.has(coderId)) {
                                coderResults.set(coderId, new Map());
                            }
                            coderResults.get(coderId)!.set(
                                `${analyzerName}-${identifier}`,
                                codedThreads
                            );
                        }
                    }
                }

                logger.info(`[${dataset.name}] Found ${coderSources.length} coders: ${coderSources.join(", ")}`);

                // Initialize metadata for this dataset
                const datasetMetadata: EnsembleMetadata = {
                    coderSources,
                    ensembleMethod: this.ensembleConfig.decisionFunction ? "function" : "threshold",
                    threshold: this.ensembleConfig.voteThreshold,
                    rollingWindow: this.ensembleConfig.rollingWindow,
                    codeProvenance: {},
                };
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
                            for (const [coderId, items] of coderItems.entries()) {
                                windowMaps.set(coderId, applyRollingWindow(
                                    items,
                                    this.ensembleConfig.rollingWindow
                                ));
                            }
                        }

                        // Process each item
                        for (const itemId of itemIds) {
                            const codeToCoders = new Map<string, string[]>();

                            // If using rolling window, collect codes directly applied to this item (for filtering)
                            const directCodes = new Set<string>();
                            if (this.ensembleConfig.rollingWindow) {
                                for (const items of coderItems.values()) {
                                    const item = items.find(i => i.id === itemId);
                                    item?.codes?.forEach(code => directCodes.add(code));
                                }
                            }

                            // Build code-to-coders map
                            for (const [coderId, items] of coderItems.entries()) {
                                const item = items.find(i => i.id === itemId);

                                // Determine which codes this coder contributes
                                const coderCodes = this.ensembleConfig.rollingWindow
                                    ? new Set([...windowMaps.get(coderId)?.get(itemId) || []].filter(c => directCodes.has(c)))
                                    : new Set(item?.codes || []);

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
                                    coderSources.length
                                );
                            } else {
                                const threshold = this.ensembleConfig.voteThreshold ?? 0.5;
                                selectedCodes = applyVoteThreshold(
                                    codeToCoders,
                                    coderSources.length,
                                    threshold
                                );
                            }

                            // Store ensemble codes for this item
                            ensembleThread.items[itemId] = {
                                id: itemId,
                                codes: selectedCodes,
                            };

                            // Track provenance for metadata
                            if (!datasetMetadata.codeProvenance[threadId]) {
                                datasetMetadata.codeProvenance[threadId] = {};
                            }
                            for (const [code, coders] of codeToCoders.entries()) {
                                if (selectedCodes.includes(code)) {
                                    datasetMetadata.codeProvenance[threadId][code] = coders;
                                }
                            }

                            // Build codes in ensemble thread
                            for (const code of selectedCodes) {
                                if (!ensembleThread.codes[code]) {
                                    ensembleThread.codes[code] = { label: code };
                                }
                                // Collect examples from source coders
                                for (const [coderId, coderAnalyzers] of coderResults.entries()) {
                                    for (const codedThreads of coderAnalyzers.values()) {
                                        const sourceThread = codedThreads.threads[threadId];
                                        if (sourceThread?.codes[code]?.examples) {
                                            ensembleThread.codes[code].examples =
                                                ensembleThread.codes[code].examples || [];
                                            for (const example of sourceThread.codes[code].examples) {
                                                if (!ensembleThread.codes[code].examples!.includes(example)) {
                                                    ensembleThread.codes[code].examples!.push(example);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        ensembleResult.threads[threadId] = ensembleThread;
                    }

                    // Consolidate codebook
                    mergeCodebook(ensembleResult);

                    // Export results
                    const filename = `${chunkKey.replace(".json", "")}-ensemble`;
                    const ensemblePath = ensureFolder(join(dataset.path, "ensemble"));

                    // Write JSON with metadata
                    const jsonPath = join(ensemblePath, `${filename}.json`);
                    const jsonOutput = {
                        ...ensembleResult,
                        metadata: datasetMetadata,
                    };
                    logger.info(`[${dataset.name}/ensemble] Writing JSON to ${jsonPath}`);
                    writeFileSync(jsonPath, JSON.stringify(jsonOutput, null, 4));

                    // Write Excel
                    const book = exportChunksForCoding(Object.values(chunks), ensembleResult);
                    const excelPath = join(ensemblePath, `${filename}.xlsx`);
                    logger.info(`[${dataset.name}/ensemble] Writing Excel to ${excelPath}`);
                    await book.xlsx.writeFile(excelPath);

                    // Store in results
                    const currentResults = this.ensembleResults.get(dataset.name) || {};
                    this.ensembleResults.set(dataset.name, {
                        ...currentResults,
                        ["ensemble"]: {
                            ...(currentResults["ensemble"] || {}),
                            [filename]: ensembleResult,
                        },
                    });
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