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

import type {
    calculateCodeLevelMetrics,
    calculatePairwiseReliability,
    CodeLevelMetrics,
    compareItems,
    DifferenceCalculator,
    extractCodedItems,
    PairwiseReliability,
} from "../evaluating/reliability-metrics.js";
import { defaultCalculateDifference } from "../evaluating/reliability-metrics.js";
import type { CodedItem, CodedThreads, DataChunk, DataItem, Dataset } from "../schema.js";
import { ensureFolder } from "../utils/io/file.js";
import { logger } from "../utils/core/logger.js";

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
     * Results saved to: <dataset>/reliability/<subdir>/
     * Defaults to "reliability"
     */
    subdir?: string;

    /**
     * Optional function to skip certain items during comparison
     *
     * Useful for filtering out items that shouldn't be included in
     * reliability calculation (e.g., items with special flags, test items, etc.)
     *
     * @param item - The coded item to evaluate
     * @returns true to skip this item, false to include it
     */
    skipItem?: (item: CodedItem) => boolean;

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
     * Whether to anonymize coder identities in outputs
     *
     * If true, replaces coder names with anonymous identifiers.
     * Useful for blind evaluation or privacy.
     * Defaults to true.
     */
    anonymize?: boolean;

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
     * 3. Filename: <dataset>/reliability/<subdir>/<subdir>-reliability.json
     */
    async #execute() {
        // Import the utility functions (dynamic import to avoid circular dependencies)
        const {
            extractCodedItems,
            compareItems,
            calculatePairwiseReliability,
            calculateCodeLevelMetrics,
        } = await import("../evaluating/reliability-metrics.js");

        // Collect datasets from consolidator
        const datasets: Dataset<TUnit[]>[] = [];
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

                    // Get all coded threads from each coder
                    const coderThreads = new Map<string, CodedThreads>();

                    // Iterate through CodeStep dependencies to get coded threads
                    for (const codeStep of consolidator.dependsOn) {
                        const results = codeStep.getResult(dataset.name);

                        // Extract coded threads from each analyzer/coder
                        for (const [analyzer, analyzerResults] of Object.entries(results)) {
                            for (const [ident, codedThreads] of Object.entries(analyzerResults)) {
                                const coderName = `${analyzer}-${ident}`;
                                coderThreads.set(coderName, codedThreads);
                            }
                        }
                    }

                    // Extract coded items from each coder
                    const coderItems = new Map<string, CodedItem[]>();
                    const coderNames: string[] = [];

                    for (const [coderName, threads] of coderThreads.entries()) {
                        const items = extractCodedItems(threads.threads);
                        coderItems.set(coderName, items);
                        coderNames.push(coderName);
                    }

                    logger.info(`Found ${coderNames.length} coders: ${coderNames.join(", ")}`);

                    // Anonymize coder names if configured
                    const anonymize = this.config.anonymize ?? true;
                    const coderNameMap = new Map<string, string>();

                    if (anonymize) {
                        coderNames.forEach((name, idx) => {
                            coderNameMap.set(name, `Coder ${idx + 1}`);
                        });
                    } else {
                        coderNames.forEach((name) => {
                            coderNameMap.set(name, name);
                        });
                    }

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

                            // Compare items
                            const comparisons = compareItems(
                                items1,
                                items2,
                                differenceCalculator,
                                this.config.skipItem,
                            );

                            logger.info(`  Compared ${comparisons.length} items`);

                            // Calculate pairwise reliability
                            const reliability = calculatePairwiseReliability(
                                comparisons,
                                coderNameMap.get(coder1Name) ?? coder1Name,
                                coderNameMap.get(coder2Name) ?? coder2Name,
                            );

                            const pairKey = `${coderNameMap.get(coder1Name)}_vs_${coderNameMap.get(coder2Name)}`;
                            pairwise[pairKey] = reliability;

                            logger.info(
                                `  Mean difference: ${reliability.meanDifference.toFixed(3)}, ` +
                                    `Agreement: ${reliability.percentAgreement.toFixed(1)}%, ` +
                                    `Alpha: ${reliability.krippendorffsAlpha.toFixed(3)}`,
                            );

                            // Calculate code-level metrics
                            const codeMetrics = calculateCodeLevelMetrics(comparisons);
                            codeLevelMetrics[pairKey] = codeMetrics;

                            logger.info(`  Calculated metrics for ${codeMetrics.length} codes`);
                        }
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
                        },
                    };

                    // Ensure output directory exists
                    const exportPath = ensureFolder(
                        join(dataset.path, "reliability", this.config.subdir ?? "reliability"),
                    );

                    // Export results to JSON
                    const outputFile = `${exportPath}-reliability.json`;
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
