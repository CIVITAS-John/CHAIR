/**
 * Consolidate Step Module
 *
 * This module consolidates multiple codebooks from different coders/strategies into
 * unified reference codebooks. It's the bridge between coding and evaluation.
 *
 * Consolidation Process:
 * 1. Collect codebooks from all CodeSteps
 * 2. Organize codebooks by dataset and group
 * 3. Merge codebooks within groups (if multiple coders)
 * 4. Build reference codebook using AI (RefiningReferenceBuilder)
 * 5. Cache results to avoid recomputation
 *
 * Reference Building:
 * - Uses LLM to refine and merge codes across codebooks
 * - Identifies synonyms and hierarchies
 * - Creates canonical labels and definitions
 * - Builds comprehensive examples
 *
 * Caching Strategy:
 * - Uses MD5 hash of input codebooks as cache key
 * - Skips expensive LLM calls if input unchanged
 * - Stores cached results alongside dataset
 *
 * Data Organization:
 * - Codebooks: Individual codebooks by coder/strategy
 * - Groups: Merged codebooks by coder group (human, ai, etc.)
 * - References: Final unified codebook for evaluation
 *
 * Pipeline Integration:
 * - Depends on CodeStep(s) for coded data
 * - Provides codebooks and references to EvaluateStep
 * - Supports multiple datasets in parallel
 */

import { join } from "path";

import md5 from "md5";

import { mergeCodebooks } from "../consolidating/codebooks.js";
import type { RefiningReferenceBuilderConfig } from "../evaluating/reference-builder.js";
import {
    buildReferenceAndExport,
    RefiningReferenceBuilder,
} from "../evaluating/reference-builder.js";
import type { Codebook, DataChunk, DataItem, Dataset } from "../schema.js";
import { withCache } from "../utils/io/cache.js";
import { ensureFolder } from "../utils/io/file.js";
import { type LLMModel, useLLMs } from "../utils/ai/llms.js";
import { logger } from "../utils/core/logger.js";

import type { AIParameters } from "./base-step.js";
import { BaseStep } from "./base-step.js";
import type { CodeStep } from "./code-step.js";

/**
 * Configuration for ConsolidateStep
 */
export interface ConsolidateStepConfig<
    TSubunit extends DataItem = DataItem,
    TUnit extends DataChunk<TSubunit> = DataChunk<TSubunit>,
> {
    /**
     * CodeStep(s) to consolidate (defaults to all coders if not specified)
     *
     * Can be a single CodeStep or array to consolidate multiple coding sources.
     */
    coder?: CodeStep<TSubunit, TUnit> | CodeStep<TSubunit, TUnit>[];

    /**
     * LLM model(s) to use for reference building
     *
     * The model will refine and merge codes across codebooks.
     */
    model: LLMModel | LLMModel[];

    /**
     * AI behavior parameters (temperature, retries, etc.)
     */
    parameters?: AIParameters;

    /**
     * Configuration for the reference builder
     *
     * Controls how codes are merged, refined, and organized.
     */
    builderConfig?: RefiningReferenceBuilderConfig;

    /**
     * Pattern for naming codebooks in the results
     *
     * Supports placeholders:
     * - {dataset}: Dataset name
     * - {analyzer}: Analyzer/strategy name
     * - {group}: Coder group name
     * - {coder}: Specific coder identifier
     * - {coder-human}: Coder name for human, "ai" for AI
     *
     * Example: "{dataset}-{group}-{coder}" → "interviews-human-alice"
     */
    namePattern?: string;

    /**
     * Prefix for reference file names
     *
     * Reference files saved as: <dataset>/references/<prefix><suffix>
     * Defaults to model name if not specified.
     */
    prefix?: string;
}

/**
 * ConsolidateStep - Merges and refines codebooks into reference standards
 *
 * Responsibilities:
 * - Collect codebooks from multiple CodeSteps
 * - Organize codebooks by dataset and coder group
 * - Merge codebooks within groups (multiple coders)
 * - Build AI-refined reference codebook
 * - Cache results to avoid redundant LLM calls
 *
 * Type Parameters:
 * - TSubunit: Type of data item (default: DataItem)
 * - TUnit: Type of data chunk (default: DataChunk<DataItem>)
 *
 * Execution Flow:
 * 1. Collect Results:
 *    - Iterate through all CodeStep dependencies
 *    - Extract codebooks from each coder/analyzer
 *    - Apply namePattern to generate codebook identifiers
 *
 * 2. Organize by Groups:
 *    - Group codebooks by coder group (human, ai, custom)
 *    - Merge codebooks within each group if multiple exist
 *    - Track which codebooks contributed to each group
 *
 * 3. Build References:
 *    - Use LLM with RefiningReferenceBuilder
 *    - Process all codebooks to create unified reference
 *    - Cache based on MD5 hash of input codebooks
 *    - Export reference with examples and metadata
 *
 * Data Structures:
 * - codebooks: All individual codebooks by name
 * - groups: Merged codebooks by group with source list
 * - references: Final AI-refined reference codebook
 *
 * Pipeline Integration:
 * - Depends on CodeStep(s) for coded data
 * - Provides three levels of data to EvaluateStep:
 *   1. Individual codebooks (for coder-level metrics)
 *   2. Group codebooks (for group-level metrics)
 *   3. Reference codebook (for reference-based metrics)
 */
export class ConsolidateStep<
    TSubunit extends DataItem = DataItem,
    TUnit extends DataChunk<TSubunit> = DataChunk<TSubunit>,
> extends BaseStep {
    /**
     * Dependencies: CodeStep(s) providing coded data
     */
    override dependsOn: CodeStep<TSubunit, TUnit>[];

    /**
     * Datasets consolidated (private until execution)
     */
    #datasets: Dataset<TUnit[]>[] = [];

    /**
     * Get the datasets being consolidated
     *
     * @throws UnexecutedError if step hasn't executed yet
     * @returns Array of datasets from CodeStep dependencies
     */
    get datasets() {
        // Sanity check - prevent access before execution
        if (!this.executed || !this.#datasets.length) {
            throw new ConsolidateStep.UnexecutedError(logger.prefixed(this._prefix, "datasets"));
        }
        return this.#datasets;
    }

    /**
     * Individual codebooks organized by dataset
     *
     * Structure: codebooks[dataset_name][codebook_name] = Codebook
     * Includes all codebooks from all coders/analyzers.
     */
    #codebooks = new Map<string, Record<string, Codebook>>();

    /**
     * Get individual codebooks for a dataset
     *
     * @param dataset - Name of the dataset
     * @throws UnexecutedError if step hasn't executed yet
     * @throws InternalError if dataset not found
     * @returns Record of codebooks by name
     */
    getCodebooks(dataset: string) {
        logger.withSource(this._prefix, "getCodebooks", () => {
            // Sanity check - ensure execution completed
            if (!this.executed || !this.#codebooks.size) {
                throw new ConsolidateStep.UnexecutedError();
            }
            // Verify dataset exists
            if (!this.#codebooks.has(dataset)) {
                throw new ConsolidateStep.InternalError(`Dataset ${dataset} not found`);
            }
        });

        return this.#codebooks.get(dataset) ?? {};
    }

    /**
     * Group-level merged codebooks organized by dataset
     *
     * Structure: groups[dataset_name][group_name] = [merged_codebook, source_names]
     * Only populated if a group has multiple codebooks to merge.
     */
    #groups = new Map<string, Record<string, [Codebook, string[]]>>();

    /**
     * Get group-level merged codebooks for a dataset
     *
     * @param dataset - Name of the dataset
     * @throws UnexecutedError if step hasn't executed yet
     * @throws InternalError if dataset not found
     * @returns Record of [merged_codebook, source_list] by group name
     */
    getGroups(dataset: string) {
        logger.withSource(this._prefix, "getGroups", () => {
            // Sanity check - ensure execution completed
            if (!this.executed || !this.#groups.size) {
                throw new ConsolidateStep.UnexecutedError();
            }
            // Verify dataset exists
            if (!this.#groups.has(dataset)) {
                throw new ConsolidateStep.InternalError(`Dataset ${dataset} not found`);
            }
        });

        return this.#groups.get(dataset) ?? {};
    }

    /**
     * AI-refined reference codebooks organized by dataset
     *
     * Structure: references[dataset_name] = Codebook
     * The definitive reference for evaluation.
     */
    #references = new Map<string, Codebook>();

    /**
     * Get the reference codebook for a dataset
     *
     * @param dataset - Name of the dataset
     * @throws UnexecutedError if step hasn't executed yet
     * @throws InternalError if dataset not found
     * @returns Reference codebook built by AI
     */
    getReference(dataset: string) {
        logger.withSource(this._prefix, "getReference", () => {
            // Sanity check - ensure execution completed
            if (!this.executed || !this.#references.size) {
                throw new ConsolidateStep.UnexecutedError();
            }
            // Verify dataset exists
            if (!this.#references.has(dataset)) {
                throw new ConsolidateStep.InternalError(`Dataset ${dataset} not found`);
            }
        });

        return this.#references.get(dataset) ?? {};
    }

    /**
     * Create a new ConsolidateStep
     *
     * @param config - Configuration for consolidation and reference building
     */
    constructor(private readonly config: ConsolidateStepConfig<TSubunit, TUnit>) {
        super();

        // Setup dependencies: normalize to array
        // If no coder specified, depends on all CodeSteps (configured elsewhere)
        this.dependsOn = config.coder
            ? Array.isArray(config.coder)
                ? config.coder
                : [config.coder]
            : [];
    }

    /**
     * Internal execution logic for consolidation
     *
     * This method orchestrates the consolidation process:
     *
     * Collection Phase:
     * 1. Iterate through all CodeStep dependencies
     * 2. For each dataset in each coder:
     *    a. Get coding results from the coder
     *    b. Extract codebooks from results
     *    c. Apply namePattern to generate identifiers
     *    d. Store in codebooks map
     *
     * Grouping Phase:
     * 1. Track codebooks by coder group
     * 2. If multiple codebooks in a group:
     *    a. Merge them using mergeCodebooks()
     *    b. Store merged result with source list
     *
     * Reference Building Phase:
     * 1. For each dataset:
     *    a. Serialize all codebooks to JSON
     *    b. Compute MD5 hash for caching
     *    c. Check cache for existing reference
     *    d. If cache miss:
     *       - Build reference using LLM
     *       - Export to files
     *       - Cache result
     *    e. Store reference in map
     *
     * Name Pattern Replacement:
     * - {dataset}: Dataset name
     * - {analyzer}: Analyzer/strategy name
     * - {group}: Coder group name
     * - {coder}: Specific coder identifier
     * - {coder-human}: Coder name or "ai"
     */
    async #_execute() {
        // Collect unique datasets from all coders
        const datasets = new Map<string, Dataset<TUnit[]>>();

        // Iterate through all CodeStep dependencies
        this.dependsOn.forEach((coder) => {
            coder.datasets.forEach((dataset) => {
                // Get coding results for this dataset from this coder
                const results = coder.getResult(dataset.name);

                // Track dataset (only add once even if multiple coders)
                if (!datasets.has(dataset.name)) {
                    datasets.set(dataset.name, dataset as unknown as Dataset<TUnit[]>);
                }

                // Track codebooks for group merging
                const codebooks: Codebook[] = [];
                const names: string[] = [];

                // Extract and store individual codebooks
                this.#codebooks.set(dataset.name, {
                    ...(this.#codebooks.get(dataset.name) ?? {}),
                    // Process each analyzer's results
                    ...Object.entries(results).reduce<Record<string, Codebook>>(
                        (acc, [analyzer, result]) => {
                            // Process each coder/identifier within the analyzer
                            Object.entries(result).forEach(([ident, codedThreads]) => {
                                // Generate codebook identifier
                                let key = `${analyzer}-${ident}`;

                                // Apply custom name pattern if configured
                                if (this.config.namePattern) {
                                    key = this.config.namePattern
                                        .replace("{dataset}", dataset.name)
                                        .replace("{analyzer}", analyzer)
                                        .replace("{group}", coder.group)
                                        .replace("{coder}", ident)
                                        .replace(
                                            "{coder-human}",
                                            coder.group === "human" ? ident : "ai",
                                        );
                                }

                                // Validate codebook exists
                                if (!codedThreads.codebook) {
                                    throw new ConsolidateStep.InternalError(
                                        `Codebook not found in ${key}`,
                                    );
                                }

                                // Store codebook
                                acc[key] = codedThreads.codebook;
                                codebooks.push(codedThreads.codebook);
                                names.push(key);
                            });
                            return acc;
                        },
                        {},
                    ),
                });

                // Create group-level merged codebooks if multiple exist
                if (!this.#groups.has(dataset.name)) {
                    this.#groups.set(dataset.name, {});
                }

                // Only merge if group has multiple codebooks
                if (codebooks.length > 1) {
                    // Merge all codebooks in this group
                    const group = mergeCodebooks(codebooks);
                    const prev = this.#groups.get(dataset.name) ?? {};
                    // Store merged codebook with list of source codebooks
                    this.#groups.set(dataset.name, { ...prev, [coder.group]: [group, names] });
                }
            });
        });

        // Store collected datasets
        this.#datasets = [...datasets.values()];

        // Normalize model configuration to array
        const models = Array.isArray(this.config.model) ? this.config.model : [this.config.model];

        // Build references using LLM(s)
        await useLLMs(async (session) => {
            for (const dataset of this.#datasets) {
                // Set context for downstream utilities
                await BaseStep.Context.with(
                    {
                        dataset,
                        session,
                    },
                    async () => {
                        // Deep copy codebooks - reference builder may modify them
                        const codes = JSON.stringify(
                            Object.values(this.#codebooks.get(dataset.name) ?? {}),
                        );

                        // Initialize reference builder with configuration
                        const builder = new RefiningReferenceBuilder(this.config.builderConfig);

                        // Determine output path for reference
                        const referencePath = join(
                            ensureFolder(join(dataset.path, "references")),
                            `${this.config.prefix ?? session.llm.name}${builder.suffix}`,
                        );

                        // Compute cache key from input codebooks
                        const hash = md5(codes);

                        // Build reference with caching
                        // If cache hit, skip expensive LLM calls
                        const reference = await withCache(referencePath, hash, () =>
                            buildReferenceAndExport(
                                builder,
                                JSON.parse(codes) as Codebook[],
                                referencePath,
                            ),
                        );

                        // Store reference for this dataset
                        this.#references.set(dataset.name, reference);
                    },
                );
            }
        }, models);

        this.executed = true;
    }

    /**
     * Execute the ConsolidateStep
     *
     * Calls base class validation then runs the internal consolidation logic.
     * All logging is scoped to this step for clear output.
     *
     * @returns Promise that resolves when consolidation completes
     */
    override async execute() {
        await super.execute();

        await logger.withSource(this._prefix, "execute", true, this.#_execute.bind(this));
    }
}
