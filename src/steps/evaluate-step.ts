/**
 * Evaluate Step Module
 *
 * This module evaluates coding quality by comparing codebooks against references
 * and computing various metrics. It's the final step in the analysis pipeline.
 *
 * Evaluation Process:
 * 1. Collect codebooks, groups, and references from ConsolidateStep
 * 2. For each dataset:
 *    a. Initialize evaluator (NetworkEvaluator)
 *    b. Evaluate individual codebooks against reference
 *    c. Evaluate group codebooks (if configured)
 *    d. Compute metrics (agreement, coverage, network similarity)
 *    e. Export results to JSON and visualizations
 *
 * Evaluation Types:
 * - Individual: Compare each coder's codebook to reference
 * - Group: Compare merged group codebooks to reference
 * - Network: Analyze code co-occurrence and relationships
 *
 * Metrics Computed:
 * - Agreement: How well coders match the reference
 * - Coverage: Percentage of reference codes identified
 * - Network Similarity: Structural similarity in code relationships
 * - Custom metrics via parameters
 *
 * Anonymization:
 * - Optionally anonymizes coder identities in outputs
 * - Useful for blind evaluation or privacy protection
 *
 * Pipeline Integration:
 * - Depends on ConsolidateStep for codebooks and references
 * - Final step - produces evaluation reports
 * - Exports results to dataset/evaluation directory
 */

import { writeFileSync } from "fs";
import { join } from "path";

// import type { CodebookEvaluator } from "../evaluating/codebooks";
import { NetworkEvaluator } from "../evaluating/network-evaluator.js";
import type { Codebook, DataChunk, DataItem, Dataset } from "../schema.js";
import { ensureFolder } from "../utils/io/file.js";
import { logger } from "../utils/core/logger.js";

import { BaseStep } from "./base-step.js";
import type { ConsolidateStep } from "./consolidate-step.js";

/**
 * Configuration for EvaluateStep
 */
export interface EvaluateStepConfig<
    TSubunit extends DataItem = DataItem,
    TUnit extends DataChunk<TSubunit> = DataChunk<TSubunit>,
> {
    // evaluator: new () => CodebookEvaluator;

    /**
     * ConsolidateStep providing codebooks and references
     *
     * Must be executed before this step runs.
     */
    consolidator: ConsolidateStep<TSubunit, TUnit>;

    /**
     * Subdirectory for evaluation outputs
     *
     * Results saved to: <dataset>/evaluation/<subdir>/
     * Defaults to "evaluation"
     */
    subdir?: string;

    /**
     * Whether to ignore group-level evaluations
     *
     * If true, only evaluates individual codebooks.
     * If false, also evaluates merged group codebooks.
     * Defaults to false.
     */
    ignoreGroups?: boolean;

    /**
     * Whether to anonymize coder identities in outputs
     *
     * If true, replaces coder names with anonymous identifiers.
     * Useful for blind evaluation or privacy.
     * Defaults to true.
     */
    anonymize?: boolean;

    /**
     * Extra parameters for the evaluator
     *
     * Passed to evaluator for custom metric computation.
     * Parameters depend on specific evaluator implementation.
     */
    parameters?: Record<string, unknown>;
}

/**
 * EvaluateStep - Computes metrics comparing codebooks to references
 *
 * Responsibilities:
 * - Collect codebooks, groups, and references from ConsolidateStep
 * - Initialize evaluator with configuration
 * - Compute agreement and coverage metrics
 * - Analyze code networks and relationships
 * - Export results and visualizations
 *
 * Type Parameters:
 * - TUnit: Type of data chunk
 * - TSubunit: Type of data item (default: DataItem)
 *
 * Execution Flow:
 * 1. Collection Phase:
 *    - Get datasets from consolidator
 *    - Extract codebooks for each dataset
 *    - Extract groups (if not ignored)
 *    - Extract reference codebook
 *
 * 2. Evaluation Phase:
 *    For each dataset:
 *    a. Initialize NetworkEvaluator
 *    b. Call evaluate() with reference, codebooks, groups
 *    c. Evaluator computes:
 *       - Individual coder metrics
 *       - Group metrics (if configured)
 *       - Network similarity
 *       - Coverage statistics
 *
 * 3. Export Phase:
 *    - Write JSON results to evaluation directory
 *    - Filename: <exportPath>-<evaluator_name>.json
 *    - Contains all computed metrics and metadata
 *
 * Evaluation Metrics:
 * - Agreement: How well coders match reference
 * - Coverage: Percentage of reference codes found
 * - Precision/Recall: Code-level accuracy
 * - Network Similarity: Structural relationship matching
 *
 * Pipeline Integration:
 * - Depends on ConsolidateStep for all data
 * - Final step in pipeline (no downstream dependencies)
 * - Produces evaluation reports for analysis
 */
export class EvaluateStep<
    TUnit extends DataChunk<TSubunit>,
    TSubunit extends DataItem = DataItem,
> extends BaseStep {
    /**
     * Dependencies: ConsolidateStep providing codebooks and references
     */
    override dependsOn: ConsolidateStep<TSubunit, TUnit>[];

    /**
     * Whether to skip group-level evaluations
     *
     * Stored as instance variable for easy access during execution.
     */
    ignoreGroups: boolean;

    /**
     * Create a new EvaluateStep
     *
     * @param config - Configuration specifying consolidator and evaluation options
     */
    constructor(private readonly config: EvaluateStepConfig<TSubunit, TUnit>) {
        super();

        // Setup dependencies (always single consolidator)
        this.dependsOn = [config.consolidator];

        // Store ignore groups flag
        this.ignoreGroups = config.ignoreGroups ?? false;
    }

    /**
     * Internal execution logic for evaluation
     *
     * This method orchestrates the evaluation process:
     *
     * Collection Phase:
     * 1. Get consolidator from configuration
     * 2. For each dataset in consolidator:
     *    a. Collect individual codebooks
     *    b. Collect group codebooks
     *    c. Collect reference codebook
     *
     * Evaluation Phase:
     * 1. For each dataset:
     *    a. Set context for utilities
     *    b. Initialize NetworkEvaluator with:
     *       - Dataset for speaker resolution
     *       - Custom parameters
     *       - Anonymization setting
     *    c. Prepare inputs:
     *       - codes: Individual codebooks
     *       - gs: Group codebooks (empty if ignoreGroups)
     *       - exportPath: Output directory
     *    d. Call evaluator.evaluate() which:
     *       - Compares codebooks to reference
     *       - Computes agreement metrics
     *       - Analyzes code networks
     *       - Exports visualizations
     *    e. Write JSON results to file
     *
     * Output Structure:
     * - File: <dataset>/evaluation/<subdir>/<subdir>-<evaluator>.json
     * - Contains: metrics, comparisons, network data
     */
    async #execute() {
        // Collect all data from consolidator
        const datasets: Dataset<TUnit>[] = [],
            codebooks = new Map<string, Record<string, Codebook>>(),
            groups = new Map<string, Record<string, [Codebook, string[]]>>(),
            references = new Map<string, Codebook>();

        const consolidator = this.config.consolidator;

        // Extract data for each dataset
        consolidator.datasets.forEach((dataset) => {
            datasets.push(dataset);
            codebooks.set(dataset.name, consolidator.getCodebooks(dataset.name));
            groups.set(dataset.name, consolidator.getGroups(dataset.name));
            references.set(dataset.name, consolidator.getReference(dataset.name));
        });

        // Evaluate each dataset
        for (const dataset of datasets.values()) {
            // Set context for downstream utilities
            await BaseStep.Context.with(
                {
                    dataset,
                },
                async () => {
                    // Initialize evaluator with configuration
                    const evaluator = new NetworkEvaluator({
                        dataset: dataset as unknown as Dataset<TUnit>,
                        parameters: this.config.parameters ?? {},
                        anonymize: this.config.anonymize ?? true,
                    });

                    // Prepare evaluation inputs
                    const codes = codebooks.get(dataset.name) ?? {};
                    // Use empty object for groups if configured to ignore them
                    const gs = this.ignoreGroups ? {} : (groups.get(dataset.name) ?? {});

                    // Ensure output directory exists
                    const exportPath = ensureFolder(
                        join(dataset.path, "evaluation", this.config.subdir ?? "evaluation"),
                    );

                    // Run evaluation
                    // Evaluator compares codebooks to reference and computes metrics
                    const results = await evaluator.evaluate(
                        references.get(dataset.name) ?? {},
                        codes,
                        gs,
                        exportPath,
                    );

                    // Export results to JSON
                    logger.info(`Writing evaluation results to ${exportPath}`);
                    writeFileSync(
                        `${exportPath}-${evaluator.name}.json`,
                        JSON.stringify(results, null, 4),
                    );
                },
            );
        }

        this.executed = true;
    }

    /**
     * Execute the EvaluateStep
     *
     * Calls base class validation then runs the internal evaluation logic.
     * All logging is scoped to this step for clear output.
     *
     * @returns Promise that resolves when evaluation completes
     */
    override async execute() {
        await super.execute();

        await logger.withSource(this._prefix, "execute", true, this.#execute.bind(this));
    }
}
