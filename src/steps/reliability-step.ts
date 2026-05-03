/**
 * Reliability Step Module
 *
 * This module calculates intercoder reliability metrics by comparing coded data
 * from multiple coders (human and AI). It's designed to run after ConsolidateStep
 * and provides comprehensive reliability analysis.
 *
 * Reliability Calculation Process:
 * 1. Collect codebooks and coded threads from ConsolidateStep
 * 2. Extract coded items from each coder's threads
 * 3. Filter items using optional skipItem function
 * 4. Compare all coder pairs using item-level difference metrics
 * 5. Calculate aggregate reliability metrics (Alpha, agreement, etc.)
 * 6. Compute per-code precision/recall metrics
 * 7. Export results to JSON
 *
 * Metrics Computed:
 * - Jaccard Distance: Set-based difference for multiple codes per item
 * - Percent Agreement: Simple agreement percentage
 * - Krippendorff's Alpha: Robust reliability metric for multiple coders
 * - Code-level Precision/Recall: Per-code accuracy metrics
 *
 * Use Cases:
 * - Comparing human coders for quality control
 * - Evaluating AI coder performance against human baseline
 * - Identifying problematic codes with low agreement
 * - Measuring overall coding scheme reliability
 *
 * Pipeline Integration:
 * - Depends on ConsolidateStep for coded data
 * - Can run in parallel with EvaluateStep (both depend on ConsolidateStep)
 * - Produces standalone reliability reports
 */

import { writeFileSync } from "fs";
import { join } from "path";

import {
    calculateCodeLevelMetrics,
    calculatePairwiseReliability,
    type CodeLevelMetrics,
    compareItems,
    type DifferenceCalculator,
    extractCodedItems,
    extractCodedItemsByThread,
    type PairwiseReliability,
    defaultCalculateDifference,
} from "../evaluating/reliability-metrics.js";
import type { Code, CodedItem, CodedThreads, DataChunk, DataItem, Dataset } from "../schema.js";
import { exportComparisonXlsx } from "../utils/io/export.js";
import { ensureFolder } from "../utils/io/file.js";
import { logger } from "../utils/core/logger.js";
import { getAllItems } from "../utils/core/misc.js";

import { BaseStep } from "./base-step.js";
import type { ConsolidateStep } from "./consolidate-step.js";

/**
 * Configuration for ReliabilityStep
 */
export interface ReliabilityStepConfig<
    TSubunit extends DataItem = DataItem,
    TUnit extends DataChunk<TSubunit> = DataChunk<TSubunit>,
> {
    /**
     * ConsolidateStep providing codebooks and coded threads
     *
     * Must be executed before this step runs.
     */
    consolidator: ConsolidateStep<TSubunit, TUnit>;

    /**
     * Subdirectory for reliability outputs
     *
     * Results saved to: <dataset>/reliability/<subdir>/<subdir>.json
     * Defaults to "default"
     */
    subdir?: string;

    /**
     * Optional function to skip certain items during comparison
     *
     * Useful for filtering out items that shouldn't be included in
     * reliability calculation (e.g., items with special flags, test items, etc.)
     *
     * @param item - The data item to evaluate
     * @returns true to skip this item, false to include it
     */
    skipItem?: (item: DataItem) => boolean;

    /**
     * Optional custom function to calculate item-level difference
     *
     * Allows customizing how code sets are compared. By default, uses
     * Jaccard distance (1 - intersection/union).
     *
     * @param codes1 - First coder's codes for the item
     * @param codes2 - Second coder's codes for the item
     * @returns Difference score (0 = identical, higher = more different)
     */
    calculateDifference?: DifferenceCalculator;

    /**
     * Optional function to skip certain codes during comparison
     *
     * Allows filtering out codes that shouldn't be included in reliability
     * calculation (e.g., codes without definitions, temporary codes, etc.)
     *
     * By default, skips codes without definitions.
     *
     * @param label - The code label
     * @param code - The Code object if found in codebook, undefined otherwise
     * @returns true to skip this code, false to include it
     */
    skipCodes?: (label: string, code: Code | undefined) => boolean;

    /**
     * Whether to anonymize coder identities in outputs
     *
     * If true, replaces coder names with anonymous identifiers.
     * Useful for blind evaluation or privacy.
     * Defaults to true.
     */
    anonymize?: boolean;

    /**
     * Size of rolling window for aggregate comparison
     *
     * Controls how codes are aggregated for reliability comparison:
     *
     * - undefined or 0: Standard item-by-item comparison (default)
     * - Positive integer: Rolling window comparison. For each item at position i,
     *   codes are aggregated from items [i-rollingWindow, ..., i, ..., i+rollingWindow].
     *   Applied AFTER skipItem filtering, so the window operates on the filtered item list.
     * - -1: Thread-level comparison. All codes within each thread are aggregated
     *   into a single representative item per thread. skipItem is applied before
     *   aggregation to exclude items from code collection. Threads where all items
     *   are skipped are omitted entirely.
     *
     * Example:
     * - rollingWindow = 1: compare codes from [i-1, i, i+1]
     * - rollingWindow = 2: compare codes from [i-2, i-1, i, i+1, i+2]
     * - rollingWindow = -1: compare deduplicated codes per thread
     *
     * Edge cases:
     * - Start/end of list: uses only available items (positive values)
     *
     * Defaults to undefined (standard item-by-item comparison).
     */
    rollingWindow?: number;

    /**
     * Extra parameters for future extensions
     *
     * Reserved for custom reliability metrics or configuration.
     */
    parameters?: Record<string, unknown>;
}

/**
 * Reliability analysis results for a single dataset
 */
export interface ReliabilityResults {
    /** Name of the dataset analyzed */
    datasetName: string;

    /** Pairwise reliability metrics for all coder pairs */
    pairwise: Record<string, PairwiseReliability>;

    /** Code-level precision/recall metrics for all coder pairs */
    codeLevelMetrics: Record<string, CodeLevelMetrics[]>;

    /** Metadata about the analysis */
    metadata: {
        /** Timestamp when analysis was performed */
        timestamp: string;
        /** Number of coders compared */
        coderCount: number;
        /** List of coder names */
        coderNames: string[];
        /** Whether coder identities were anonymized */
        anonymized: boolean;
        /** Whether custom difference calculator was used */
        customDifferenceCalculator: boolean;
        /** Whether item filter was applied */
        filterApplied: boolean;
        /** Size of rolling window if applied (benefit-only comparison) */
        rollingWindowSize?: number;
        /** Whether code filtering was applied */
        codeFilterApplied: boolean;
        /** List of codes that were skipped during comparison */
        skippedCodes?: string[];
        /** Total number of unique codes in the dataset */
        totalCodesCount?: number;
        /** Number of codes actually compared */
        comparedCodesCount?: number;
    };
}

/**
 * ReliabilityStep - Calculates intercoder reliability metrics
 *
 * Responsibilities:
 * - Collect coded data from ConsolidateStep
 * - Extract coded items from all coders
 * - Compare all coder pairs using difference metrics
 * - Calculate aggregate reliability statistics
 * - Compute code-level precision/recall
 * - Export comprehensive reliability reports
 *
 * Type Parameters:
 * - TUnit: Type of data chunk
 * - TSubunit: Type of data item (default: DataItem)
 *
 * Execution Flow:
 * 1. Collection Phase:
 *    - Get datasets from consolidator
 *    - Extract codebooks for each dataset
 *    - Extract coded threads from CodeStep results
 *
 * 2. Comparison Phase:
 *    For each dataset:
 *    a. Extract coded items from each coder's threads
 *    b. Apply optional filter function
 *    c. Compare all coder pairs:
 *       - Calculate item-level differences
 *       - Compute pairwise reliability metrics
 *       - Generate code-level precision/recall
 *
 * 3. Export Phase:
 *    - Write JSON results to reliability directory
 *    - Include metadata and configuration info
 *    - Filename: <exportPath>-reliability.json
 */
export class ReliabilityStep<
    TUnit extends DataChunk<TSubunit>,
    TSubunit extends DataItem = DataItem,
> extends BaseStep {
    /**
     * Dependencies: ConsolidateStep providing coded data
     */
    override dependsOn: ConsolidateStep<TSubunit, TUnit>[];

    /**
     * Create a new ReliabilityStep
     *
     * @param config - Configuration specifying consolidator and reliability options
     */
    constructor(private readonly config: ReliabilityStepConfig<TSubunit, TUnit>) {
        super();

        // Setup dependencies (always single consolidator)
        this.dependsOn = [config.consolidator];
    }

    /**
     * Internal execution logic for reliability analysis
     *
     * This method orchestrates the reliability calculation process:
     *
     * Collection Phase:
     * 1. Get consolidator from configuration
     * 2. For each dataset in consolidator:
     *    a. Collect individual codebooks
     *    b. Extract coded threads from each coder
     *
     * Comparison Phase:
     * 1. For each dataset:
     *    a. Extract coded items from each coder's threads
     *    b. Filter items using optional skipItem function
     *    c. Compare all coder pairs:
     *       - Use custom or default difference calculator
     *       - Calculate pairwise reliability metrics
     *       - Compute code-level precision/recall
     *
     * Export Phase:
     * 1. Assemble results with metadata
     * 2. Write JSON to reliability directory
     * 3. Filename: <dataset>/reliability/<subdir>/<subdir>.json
     */
    async #execute() {
        // Collect datasets from consolidator
        const datasets: Dataset<TUnit>[] = [];
        const codebooks = new Map<string, Record<string, unknown>>();

        const consolidator = this.config.consolidator;

        // Extract data for each dataset
        consolidator.datasets.forEach((dataset) => {
            datasets.push(dataset);
            // Get codebooks (we need access to coded threads, which we'll get from CodeSteps)
            codebooks.set(dataset.name, consolidator.getCodebooks(dataset.name));
        });

        // Analyze each dataset
        for (const dataset of datasets.values()) {
            await BaseStep.Context.with(
                {
                    dataset,
                },
                async () => {
                    logger.info(`Calculating reliability for dataset: ${dataset.name}`);

                    // Get all coded threads from each coder, merging chunks from the same CodeStep
                    const coderThreads = new Map<string, CodedThreads>();

                    for (const codeStep of consolidator.dependsOn) {
                        const results = codeStep.getResult(dataset.name);

                        // Merge all chunk results per analyzer into a single coder entry
                        for (const [_analyzer, analyzerResults] of Object.entries(results)) {
                            const mergedThreads: CodedThreads = { threads: {} };
                            let firstIdent = "";

                            for (const [ident, codedThreads] of Object.entries(analyzerResults)) {
                                if (!firstIdent) firstIdent = ident;
                                const ct = codedThreads as CodedThreads;
                                // Merge threads from all chunks (disjoint thread IDs)
                                for (const [threadId, thread] of Object.entries(ct.threads)) {
                                    mergedThreads.threads[threadId] = thread;
                                }
                                // Merge codebook if present
                                if (ct.codebook) {
                                    mergedThreads.codebook = {
                                        ...(mergedThreads.codebook ?? {}),
                                        ...ct.codebook,
                                    };
                                }
                            }

                            const coderName = codeStep.getCoderIdentifier(firstIdent);
                            coderThreads.set(coderName, mergedThreads);
                        }
                    }

                    // Extract all data items from dataset for filtering
                    const allDataItems = getAllItems(dataset);
                    const dataItemsMap = new Map(allDataItems.map((item) => [item.id, item]));
                    logger.info(`Extracted ${dataItemsMap.size} data items from dataset`);

                    // Extract coded items from each coder
                    const coderNames = Array.from(coderThreads.keys());
                    const isThreadLevel = this.config.rollingWindow === -1;
                    const coderItems = new Map(
                        Array.from(coderThreads.entries()).map(([name, threads]) => [
                            name,
                            isThreadLevel
                                ? extractCodedItemsByThread(threads.threads, this.config.skipItem, dataItemsMap)
                                : extractCodedItems(threads.threads),
                        ]),
                    );

                    logger.info(`Found ${coderNames.length} coders: ${coderNames.join(", ")}`);
                    if (isThreadLevel) {
                        logger.info(`Thread-level mode: aggregated items into ${coderItems.get(coderNames[0])?.length ?? 0} threads`);
                    }

                    // Get reference codebook for code filtering
                    const referenceCodebook = consolidator.getReference(dataset.name);

                    // Default skipCodes function: skip codes without definitions
                    const skipCodesFunction = this.config.skipCodes ??
                        ((label: string, code: Code | undefined) => !code || !code.definitions?.length);

                    // Track skipped codes
                    const skippedCodesSet = new Set<string>();
                    const allCodesSet = new Set<string>();

                    // Anonymize coder names if configured
                    const anonymize = this.config.anonymize ?? false;
                    const coderNameMap = new Map(
                        coderNames.map((name, idx) => [
                            name,
                            anonymize ? `Coder ${idx + 1}` : name,
                        ]),
                    );

                    // Ensure output directory exists
                    const subdir = this.config.subdir ?? "default";
                    const exportPath = ensureFolder(join(dataset.path, "reliability", subdir));

                    // Get chunks for comparison XLSX export
                    const chunks = Object.values(dataset.data).flatMap((cg) => Object.values(cg));

                    // Compare all coder pairs
                    const pairwise: Record<string, PairwiseReliability> = {};
                    const codeLevelMetrics: Record<string, CodeLevelMetrics[]> = {};

                    const differenceCalculator =
                        this.config.calculateDifference ?? defaultCalculateDifference;

                    for (let i = 0; i < coderNames.length; i++) {
                        for (let j = i + 1; j < coderNames.length; j++) {
                            const coder1Name = coderNames[i];
                            const coder2Name = coderNames[j];

                            const items1 = coderItems.get(coder1Name) ?? [];
                            const items2 = coderItems.get(coder2Name) ?? [];

                            logger.info(
                                `Comparing ${coderNameMap.get(coder1Name)} vs ${coderNameMap.get(coder2Name)}`,
                            );

                            // Track codes from both coders before filtering
                            for (const item of [...items1, ...items2]) {
                                if (item.codes) {
                                    item.codes.forEach(label => allCodesSet.add(label));
                                }
                            }

                            // Compare items with code filtering using the full codebook
                            // In thread-level mode, skipItem was already applied during extraction
                            const comparisons = compareItems(
                                items1,
                                items2,
                                referenceCodebook,
                                differenceCalculator,
                                isThreadLevel ? undefined : this.config.skipItem,
                                dataItemsMap,
                                isThreadLevel ? undefined : this.config.rollingWindow,
                                skipCodesFunction,
                            );

                            // Track which codes were skipped
                            for (const label of allCodesSet) {
                                const code = referenceCodebook[label];
                                if (skipCodesFunction(label, code)) {
                                    skippedCodesSet.add(label);
                                }
                            }

                            logger.info(`  Compared ${comparisons.length} items`);

                            // Calculate pairwise reliability with full codebook
                            const reliability = calculatePairwiseReliability(
                                comparisons,
                                coderNameMap.get(coder1Name) ?? coder1Name,
                                coderNameMap.get(coder2Name) ?? coder2Name,
                                referenceCodebook,
                            );

                            const pairKey = `${coderNameMap.get(coder1Name)}_vs_${coderNameMap.get(coder2Name)}`;
                            pairwise[pairKey] = reliability;

                            logger.info(
                                `  Mean difference: ${reliability.meanDifference.toFixed(3)}, ` +
                                    `Alpha: ${reliability.krippendorffsAlpha.toFixed(3)}`,
                            );

                            // Calculate code-level metrics using adjusted codes (will only include compared codes)
                            // Filter out skipped codes from the metrics
                            const allCodeMetrics = calculateCodeLevelMetrics(comparisons, true);
                            const filteredCodeMetrics = allCodeMetrics.filter(metric =>
                                !skippedCodesSet.has(metric.code)
                            );
                            codeLevelMetrics[pairKey] = filteredCodeMetrics;

                            logger.info(`  Calculated metrics for ${filteredCodeMetrics.length} codes`);

                            // Export comparison XLSX
                            const compBook = exportComparisonXlsx(
                                chunks,
                                comparisons,
                                coderNameMap.get(coder1Name) ?? coder1Name,
                                coderNameMap.get(coder2Name) ?? coder2Name,
                            );
                            const compPath = join(exportPath, `${pairKey}.xlsx`);
                            await compBook.xlsx.writeFile(compPath);
                            logger.info(`  Wrote comparison XLSX to ${compPath}`);
                        }
                    }

                    // Log skipped codes information
                    const skippedCodesList = Array.from(skippedCodesSet).sort();
                    const comparedCodesCount = allCodesSet.size - skippedCodesSet.size;

                    if (skippedCodesList.length > 0) {
                        logger.info(`Skipped ${skippedCodesList.length} codes without definitions: ${skippedCodesList.join(", ")}`);
                        logger.info(`Compared ${comparedCodesCount} codes out of ${allCodesSet.size} total codes`);
                    }

                    // Assemble results
                    const results: ReliabilityResults = {
                        datasetName: dataset.name,
                        pairwise,
                        codeLevelMetrics,
                        metadata: {
                            timestamp: new Date().toISOString(),
                            coderCount: coderNames.length,
                            coderNames: coderNames.map(
                                (name) => coderNameMap.get(name) ?? name,
                            ),
                            anonymized: anonymize,
                            customDifferenceCalculator: !!this.config.calculateDifference,
                            filterApplied: !!this.config.skipItem,
                            rollingWindowSize: this.config.rollingWindow,
                            codeFilterApplied: true, // Always true now since we have a default
                            skippedCodes: skippedCodesList.length > 0 ? skippedCodesList : undefined,
                            totalCodesCount: allCodesSet.size,
                            comparedCodesCount: comparedCodesCount,
                        },
                    };

                    // Export results to JSON
                    const outputFile = join(exportPath, `${subdir}.json`);
                    logger.info(`Writing reliability results to ${outputFile}`);
                    writeFileSync(outputFile, JSON.stringify(results, null, 4));

                    logger.info(`Reliability analysis complete for ${dataset.name}`);
                },
            );
        }

        this.executed = true;
    }

    /**
     * Execute the ReliabilityStep
     *
     * Calls base class validation then runs the internal reliability analysis logic.
     * All logging is scoped to this step for clear output.
     *
     * @returns Promise that resolves when reliability analysis completes
     */
    override async execute() {
        await super.execute();

        await logger.withSource(this._prefix, "execute", true, this.#execute.bind(this));
    }
}
