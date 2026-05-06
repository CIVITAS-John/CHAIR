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
    compareItems,
    extractCodedItems,
    extractCodedItemsByChunk,
    defaultCalculateDifference,
} from "../evaluating/reliability-metrics.js";
import type {
    CodeLevelMetrics,
    PairwiseReliability,
    ReliabilityComparisonLevel,
    ReliabilityLevelResults,
    ReliabilityResults,
    ReliabilityStepConfig,
} from "../evaluating/reliability-interfaces.js";
import type { Code, Codebook, CodedItem, CodedThreads, DataChunk, DataItem } from "../schema.js";
import { exportComparisonXlsx } from "../utils/io/export.js";
import { ensureFolder } from "../utils/io/file.js";
import { logger } from "../utils/core/logger.js";
import { getAllItems } from "../utils/core/misc.js";

import { BaseStep } from "./base-step.js";
import type { ConsolidateStep } from "./consolidate-step.js";

export type {
    ReliabilityComparisonLevel,
    ReliabilityLevelResults,
    ReliabilityResults,
    ReliabilityStepConfig,
} from "../evaluating/reliability-interfaces.js";

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
    #comparisonLevels(): ReliabilityComparisonLevel[] {
        const levels = new Set<ReliabilityComparisonLevel>(
            this.config.comparisonLevels ?? ["item"],
        );
        if (this.config.rollingWindow === -1) {
            levels.delete("item");
            levels.add("chunk");
        }
        if (levels.size === 0) {
            levels.add("item");
        }
        return Array.from(levels);
    }

    #collectCoderThreads(datasetName: string) {
        const coderThreads = new Map<string, CodedThreads>();

        for (const codeStep of this.config.consolidator.dependsOn) {
            const results = codeStep.getResult(datasetName);

            for (const analyzerResults of Object.values(results)) {
                const mergedThreads: CodedThreads = { threads: {} };
                let firstIdent = "";

                for (const [ident, codedThreads] of Object.entries(analyzerResults)) {
                    firstIdent ||= ident;
                    for (const [threadId, thread] of Object.entries(codedThreads.threads)) {
                        mergedThreads.threads[threadId] = thread;
                    }
                    if (codedThreads.codebook) {
                        mergedThreads.codebook = {
                            ...(mergedThreads.codebook ?? {}),
                            ...codedThreads.codebook,
                        };
                    }
                }

                coderThreads.set(codeStep.getCoderIdentifier(firstIdent), mergedThreads);
            }
        }

        return coderThreads;
    }

    #extractItemsForLevel(
        level: ReliabilityComparisonLevel,
        coderThreads: Map<string, CodedThreads>,
        chunks: TUnit[],
    ) {
        return new Map<string, CodedItem[]>(
            Array.from(coderThreads.entries()).map(([name, threads]) => [
                name,
                level === "chunk"
                    ? extractCodedItemsByChunk(threads.threads, chunks, this.config.skipItem)
                    : extractCodedItems(threads.threads),
            ]),
        );
    }

    #collectObservedCodes(coderThreads: Map<string, CodedThreads>) {
        const observedCodes = new Set<string>();
        for (const codedThreads of coderThreads.values()) {
            for (const thread of Object.values(codedThreads.threads)) {
                for (const item of Object.values(thread.items)) {
                    for (const code of item.codes ?? []) {
                        observedCodes.add(code);
                    }
                }
            }
        }
        return observedCodes;
    }

    #filterCodebook(referenceCodebook: Codebook, observedCodes: Set<string>) {
        const skipCodes =
            this.config.skipCodes ??
            ((_label: string, code: Code | undefined) => !code?.definitions?.length);

        const comparedCodebook: Codebook = {};
        const skippedCodes = new Set<string>();

        for (const [label, code] of Object.entries(referenceCodebook)) {
            if (skipCodes(label, code)) {
                skippedCodes.add(label);
            } else {
                comparedCodebook[label] = code;
            }
        }

        for (const label of observedCodes) {
            if (referenceCodebook[label]) continue;
            if (skipCodes(label, undefined)) {
                skippedCodes.add(label);
            } else {
                comparedCodebook[label] = { label };
            }
        }

        return {
            comparedCodebook,
            skippedCodesList: Array.from(skippedCodes).sort(),
        };
    }

    async #calculateLevelResults({
        level,
        coderNames,
        coderItems,
        coderNameMap,
        chunks,
        dataItemsMap,
        codebook,
        exportPath,
    }: {
        level: ReliabilityComparisonLevel;
        coderNames: string[];
        coderItems: Map<string, CodedItem[]>;
        coderNameMap: Map<string, string>;
        chunks: TUnit[];
        dataItemsMap: Map<string, DataItem>;
        codebook: Codebook;
        exportPath: string;
    }): Promise<ReliabilityLevelResults> {
        const pairwise: Record<string, PairwiseReliability> = {};
        const codeLevelMetrics: Record<string, CodeLevelMetrics[]> = {};
        const differenceCalculator = this.config.calculateDifference ?? defaultCalculateDifference;
        const shouldSkipMissingCode = (_label: string, code: Code | undefined) => !code;

        logger.info(`Calculating ${level}-level reliability`);

        for (let i = 0; i < coderNames.length; i++) {
            for (let j = i + 1; j < coderNames.length; j++) {
                const coder1Name = coderNames[i];
                const coder2Name = coderNames[j];
                const display1 = coderNameMap.get(coder1Name) ?? coder1Name;
                const display2 = coderNameMap.get(coder2Name) ?? coder2Name;
                const pairKey = `${display1}_vs_${display2}`;

                logger.info(`Comparing ${display1} vs ${display2} (${level})`);

                const comparisons = compareItems(
                    coderItems.get(coder1Name) ?? [],
                    coderItems.get(coder2Name) ?? [],
                    codebook,
                    differenceCalculator,
                    level === "item" ? this.config.skipItem : undefined,
                    level === "item" ? dataItemsMap : undefined,
                    level === "item" ? this.config.rollingWindow : undefined,
                    shouldSkipMissingCode,
                    level === "item" ? chunks : undefined,
                );

                const reliability = calculatePairwiseReliability(
                    comparisons,
                    display1,
                    display2,
                    codebook,
                );

                pairwise[pairKey] = reliability;
                codeLevelMetrics[pairKey] = calculateCodeLevelMetrics(comparisons, true);

                logger.info(
                    `  Compared ${comparisons.length} ${level}s; ` +
                        `mean difference: ${reliability.meanDifference.toFixed(3)}, ` +
                        `Alpha: ${reliability.krippendorffsAlpha.toFixed(3)}`,
                );

                if (level === "item") {
                    const compBook = exportComparisonXlsx(chunks, comparisons, display1, display2);
                    const compPath = join(exportPath, `${pairKey}.xlsx`);
                    await compBook.xlsx.writeFile(compPath);
                    logger.info(`  Wrote comparison XLSX to ${compPath}`);
                }
            }
        }

        return { pairwise, codeLevelMetrics };
    }

    async #execute() {
        const consolidator = this.config.consolidator;
        const comparisonLevels = this.#comparisonLevels();

        for (const dataset of consolidator.datasets) {
            await BaseStep.Context.with({ dataset }, async () => {
                logger.info(`Calculating reliability for dataset: ${dataset.name}`);

                const coderThreads = this.#collectCoderThreads(dataset.name);
                const coderNames = Array.from(coderThreads.keys());
                const anonymize = this.config.anonymize ?? false;
                const coderNameMap = new Map(
                    coderNames.map((name, idx) => [name, anonymize ? `Coder ${idx + 1}` : name]),
                );

                const chunks = Object.values(dataset.data).flatMap((cg) => Object.values(cg));
                const dataItemsMap = new Map(getAllItems(dataset).map((item) => [item.id, item]));
                const observedCodes = this.#collectObservedCodes(coderThreads);
                const { comparedCodebook, skippedCodesList } = this.#filterCodebook(
                    consolidator.getReference(dataset.name),
                    observedCodes,
                );

                logger.info(`Found ${coderNames.length} coders: ${coderNames.join(", ")}`);
                logger.info(`Extracted ${dataItemsMap.size} data items from dataset`);
                if (skippedCodesList.length > 0) {
                    logger.info(
                        `Skipped ${skippedCodesList.length} codes: ${skippedCodesList.join(", ")}`,
                    );
                }

                const subdir = this.config.subdir ?? "default";
                const exportPath = ensureFolder(join(dataset.path, "reliability", subdir));
                const resultsByLevel: ReliabilityResults["results"] = {};

                for (const level of comparisonLevels) {
                    const coderItems = this.#extractItemsForLevel(level, coderThreads, chunks);
                    const firstCoderItemCount = coderItems.get(coderNames[0])?.length ?? 0;
                    logger.info(`Prepared ${firstCoderItemCount} ${level}-level comparison units`);

                    resultsByLevel[level] = await this.#calculateLevelResults({
                        level,
                        coderNames,
                        coderItems,
                        coderNameMap,
                        chunks,
                        dataItemsMap,
                        codebook: comparedCodebook,
                        exportPath,
                    });
                }

                const results: ReliabilityResults = {
                    metadata: {
                        timestamp: new Date().toISOString(),
                        datasetName: dataset.name,
                        coderCount: coderNames.length,
                        coderNames: coderNames.map((name) => coderNameMap.get(name) ?? name),
                        comparisonLevels,
                        anonymized: anonymize,
                        customDifferenceCalculator: !!this.config.calculateDifference,
                        filterApplied: !!this.config.skipItem,
                        rollingWindowSize:
                            this.config.rollingWindow && this.config.rollingWindow > 0
                                ? this.config.rollingWindow
                                : undefined,
                        codeFilterApplied: true,
                        skippedCodes: skippedCodesList.length > 0 ? skippedCodesList : undefined,
                        totalCodesCount: Object.keys(consolidator.getReference(dataset.name))
                            .length,
                        comparedCodesCount: Object.keys(comparedCodebook).length,
                    },
                    results: resultsByLevel,
                };

                const outputFile = join(exportPath, `${subdir}.json`);
                logger.info(`Writing reliability results to ${outputFile}`);
                writeFileSync(outputFile, JSON.stringify(results, null, 4));

                logger.info(`Reliability analysis complete for ${dataset.name}`);
            });
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
