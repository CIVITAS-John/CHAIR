/**
 * Code Step Module
 *
 * This module handles qualitative coding of data chunks using either AI or human coders.
 * It's the core analysis step that applies codes (themes, categories) to data items.
 *
 * Dual-Mode Operation:
 * 1. AI Mode: Uses LLMs with analysis strategies to automatically code data
 * 2. Human Mode: Imports codes from Excel files filled out by human coders
 *
 * AI Coding Process:
 * - Applies analyzer strategies to chunks using LLMs
 * - Supports multiple models and strategies in parallel
 * - Iterates through chunks with context windows
 * - Builds codebooks with examples
 * - Exports results to Excel and JSON
 *
 * Human Coding Process:
 * - Exports empty Excel templates for coders
 * - Imports completed codes from Excel/JSON
 * - Supports multiple coders independently
 * - Handles missing/incomplete files interactively
 * - Builds codebooks from imported codes
 *
 * Data Flow:
 * Input: Dataset from LoadStep
 * Processing: Apply codes to each item in each chunk
 * Output: CodedThreads with codes, examples, and codebook
 *
 * Pipeline Integration:
 * - Depends on LoadStep for data
 * - Provides coded results to ConsolidateStep
 * - Supports multiple datasets in parallel
 */

import { existsSync, readdirSync, writeFileSync } from "fs";
import { basename, extname, join } from "path";

import { select } from "@inquirer/prompts";
import open from "open";

import { Analyzer, loopThroughChunk } from "../analyzer.js";
import { buildCodes, mergeCodebook } from "../consolidating/codebooks.js";
import type {
    Codebook,
    CodedThread,
    CodedThreads,
    DataChunk,
    DataItem,
    Dataset,
} from "../schema.js";
import { exportChunksForCoding } from "../utils/io/export.js";
import { importCodes } from "../utils/io/import.js";
import { ensureFolder, readJSONFile } from "../utils/io/file.js";
import type { LLMModel } from "../utils/ai/llms.js";
import { requestLLM, useLLMs } from "../utils/ai/llms.js";
import { logger } from "../utils/core/logger.js";
import { assembleExampleFrom } from "../utils/core/misc.js";

import type { AIParameters } from "./base-step.js";
import { BaseStep } from "./base-step.js";
import type { LoadStep } from "./load-step.js";

/**
 * Type for analyzer constructor functions
 *
 * Allows passing either analyzer instances or constructor functions,
 * enabling flexible configuration and lazy instantiation.
 */
type AnalyzerConstructor<TUnit, TSubunit, TAnalysis> = new (
    ...args: ConstructorParameters<typeof Analyzer<TUnit, TSubunit, TAnalysis>>
) => Analyzer<TUnit, TSubunit, TAnalysis>;

/**
 * Configuration for CodeStep with dual-mode support
 *
 * Common Properties:
 * - dataset: Which LoadStep(s) to code (defaults to all loaded datasets)
 * - group: Name for this coder group (for consolidation)
 *
 * Mode-Specific Properties:
 *
 * Human Mode (agent: "Human"):
 * - subdir: Where to find/create Excel files (default: "human")
 * - coders: List of coder names (files: <subdir>/<coder>.xlsx)
 * - onMissing: Behavior when files are missing/empty
 *   - "ask": Prompt user for action (default)
 *   - "skip": Skip this coder
 *   - "wait": Open file and wait for user to fill it
 *   - "abort": Stop execution
 * - codebookSheet: Excel sheet name for codebook (default: "Codebook")
 *
 * AI Mode (agent: "AI"):
 * - strategy: Analysis strategy/strategies to apply
 *   - Can be Analyzer instance or constructor
 *   - Supports array for multiple strategies
 * - model: LLM model(s) to use
 *   - Can be single model or array
 * - parameters: AI behavior settings
 *   - retries: How many times to retry failed requests
 *   - temperature: LLM creativity (0-2)
 *   - customPrompt: Additional instructions
 *   - fakeRequest: Testing mode (skip actual LLM calls)
 */
export type CodeStepConfig<
    TSubunit extends DataItem = DataItem,
    TUnit extends DataChunk<TSubunit> = DataChunk<TSubunit>,
> = {
    /** Which LoadStep(s) provide the data to code (defaults to all loaded datasets) */
    dataset?: LoadStep<TUnit> | LoadStep<TUnit>[];
} & (
    | {
          /** Use human coders via Excel files */
          agent: "Human";
          /** Group name for organizing results (defaults to "human") */
          group?: string;
          /** Path to Excel/JSON files relative to dataset (defaults to "human") */
          subdir?: string;
          /** Coder names - files at <subdir>/<coder>.xlsx/json */
          coders?: string[];
          /** What to do if file is missing/empty (defaults to "ask") */
          onMissing?: "ask" | "skip" | "wait" | "abort";
          /** Excel sheet name for codebook (defaults to "Codebook") */
          codebookSheet?: string;
      }
    | {
          /** Use AI to automatically code data */
          agent: "AI";
          /** Group name for organizing results (defaults to "ai") */
          group?: string;
          /** Analysis strategy/strategies to apply to the data */
          strategy:
              | AnalyzerConstructor<TUnit, TSubunit, CodedThread>
              | Analyzer<TUnit, TSubunit, CodedThread>
              | (
                    | Analyzer<TUnit, TSubunit, CodedThread>
                    | AnalyzerConstructor<TUnit, TSubunit, CodedThread>
                )[];
          /** LLM model(s) to use for coding */
          model: LLMModel | LLMModel[];
          /** AI behavior parameters (temperature, retries, etc.) */
          parameters?: AIParameters;
          /** Optional codebook for deductive coding (file path or Codebook object) */
          codebook?: string | import("../schema.js").Codebook;
      }
);

/**
 * Filter codebook to codes matching category filter(s)
 *
 * Matches codes where any category path starts with the filter string.
 * Example: filter="Social" matches code with categories=["Social Interaction"]
 *
 * @param codebook - Full codebook to filter
 * @param filter - Category string or array (matches prefix)
 * @returns Filtered codebook with matching codes
 */
const filterCodebookByCategory = (
    codebook: Codebook | undefined,
    filter: string | string[]
): Codebook | undefined => {
    if (!codebook) return undefined;

    const filters = Array.isArray(filter) ? filter : [filter];
    const result: Codebook = {};

    for (const [label, code] of Object.entries(codebook)) {
        if (code.categories?.some(cat => filters.some(f => cat.startsWith(f)))) {
            result[label] = code;
        }
    }

    logger.debug(`Filtered codebook: ${Object.keys(codebook).length} → ${Object.keys(result).length} codes`);
    return result;
};

/**
 * Analyze data chunks using an AI-powered analyzer
 *
 * This is the core function for AI-based qualitative coding. It orchestrates
 * the complex process of applying codes to data items using LLMs.
 *
 * Process Overview:
 * 1. Initialize analysis structures for each chunk
 * 2. Populate codebook if provided (for deductive coding)
 * 3. Batch preprocess all chunks (analyzer-specific preparation)
 * 4. For each chunk:
 *    a. Filter out empty items and subchunks (not yet supported)
 *    b. Loop through items in windows (defined by analyzer)
 *    c. Build prompts with context (previous summary, current items)
 *    d. Send to LLM and parse response
 *    e. Extract codes and examples from response
 *    f. Store codes in analysis structure
 * 5. Consolidate codebook from all codes
 *
 * Windowing Strategy:
 * - Chunks may be too large for LLM context windows
 * - Analyzer defines window size via chunkSize
 * - Windows can overlap to maintain context
 * - Previous window summary included in next window's prompt
 *
 * Code Extraction:
 * - LLM responses parsed by analyzer's parseResponse()
 * - Codes normalized (lowercase, trimmed, cleaned)
 * - Examples collected for each code
 * - Duplicate examples filtered out
 *
 * Error Handling:
 * - Retries failed LLM requests with increasing temperature
 * - Wraps errors in CodeStep.InternalError for tracking
 * - Logs detailed progress at each step
 *
 * Caching:
 * - Results stored in analyzed parameter (accumulator pattern)
 * - Supports resuming/incremental analysis
 * - Overlapping codes merged across windows
 *
 * @param analyzer - Analysis strategy defining prompts and parsing
 * @param chunks - Data chunks to analyze
 * @param analyzed - Accumulator for results (supports incremental analysis)
 * @param codebook - Optional predefined codebook for deductive coding
 * @param aiParams - AI parameters (temperature, retries, customPrompt, etc.)
 * @returns CodedThreads with codes, examples, and codebook
 */
const analyzeChunks = <T extends DataItem>(
    analyzer: Analyzer<DataChunk<T>, T, CodedThread>,
    chunks: Record<string, DataChunk<T>>,
    analyzed: CodedThreads = { threads: {} },
    codebook?: Codebook,
    aiParams?: AIParameters,
) =>
    logger.withDefaultSource("analyzeChunks", async () => {
        const { dataset } = BaseStep.Context.get();

        const keys = Object.keys(chunks);
        logger.info(`[${dataset.name}] Analyzing ${keys.length} chunks`);

        // Initialize the analysis structures for each chunk
        // Creates a CodedThread for each chunk with empty code placeholders for each item
        for (const [key, chunk] of Object.entries(chunks)) {
            // Filter items to only include simple data items (not subchunks)
            // TODO: Support subchunks - currently nested chunks are skipped
            const messages = chunk.items.filter((m) => {
                if (!("content" in m)) {
                    logger.warn("Subchunks are not yet supported, skipping");
                    return false;
                }
                // Skip empty items as they can't be meaningfully coded
                return m.content !== "";
            }) as T[];

            // Initialize or preserve existing analysis structure
            // Supports resuming analysis or incremental updates
            analyzed.threads[key] = analyzed.threads[key] ?? {
                id: key,
                items: Object.fromEntries(messages.map((m) => [m.id, { id: m.id }])),
                iteration: 0,
                codes: {},
            };

            // Populate with predefined codebook for deductive coding
            // Merges code definitions to analysis.codes by deep clone (supports substeps)
            if (codebook) {
                analyzed.threads[key].codes = {
                    ...analyzed.threads[key].codes,
                    ...JSON.parse(JSON.stringify(codebook))
                };
            }
        }

        // Batch preprocess all chunks before analysis
        // Allows analyzers to perform bulk operations (e.g., loading embeddings, building indices)
        await analyzer.batchPreprocess(
            keys.map((k) => chunks[k]),
            keys.map((k) => analyzed.threads[k]),
        );

        // Process each chunk through the analyzer
        for (const [key, chunk] of Object.entries(chunks)) {
            // Filter items again (same as initialization, for consistency)
            // TODO: Support subchunks - currently nested chunks are skipped
            const messages = chunk.items.filter((m) => {
                if (!("content" in m)) {
                    logger.warn("Subchunks are not yet supported, skipping", "analyzeChunk");
                    return false;
                }
                return m.content !== "";
            }) as T[];
            logger.info(`[${dataset.name}] Analyzing chunk ${key} with ${messages.length} items`);

            // Get the analysis structure for this chunk
            const analysis = analyzed.threads[key];

            // Track previous analysis for merging overlapping window codes
            let prevAnalysis: CodedThread | undefined;

            try {
                // Loop through the chunk in windows defined by the analyzer
                // Windows allow processing large chunks that exceed LLM context limits
                await loopThroughChunk(
                    analyzer,
                    analysis,
                    chunk,
                    messages,
                    // Callback invoked for each window of items
                    async (currents, contexts, chunkStart, isFirst, tries, iteration, actionAiParams) => {
                        // Merge codes from overlapping windows
                        // When windows overlap, preserve codes from previous window for shared items
                        if (prevAnalysis && prevAnalysis !== analysis) {
                            for (const [id, item] of Object.entries(prevAnalysis.items)) {
                                // Check if this item exists in current chunk
                                if (chunk.items.findIndex((m) => m.id === id) !== -1) {
                                    analysis.items[id] = { id, codes: item.codes };
                                }
                            }
                        }

                        // Build prompts for this window
                        // Returns [system_prompt, user_prompt] tailored to current items and context
                        const prompts = await analyzer.buildPrompts(
                            analysis,
                            chunk,
                            currents,
                            contexts,
                            chunkStart,
                            iteration,
                            actionAiParams,
                        );
                        let response = "";

                        // Send prompts to LLM if either prompt is non-empty
                        if (prompts[0] !== "" || prompts[1] !== "") {
                            // Add summary from previous window to maintain context
                            if (!isFirst && analysis.summary) {
                                prompts[1] = `Summary of previous conversation: ${analysis.summary}\n${prompts[1]}`;
                            }

                            logger.debug(
                                `[${dataset.name}/${key}] Requesting LLM, iteration ${iteration}`,
                            );

                            // Request with dynamic temperature: base + retry adjustment
                            // Each retry increases temperature by 0.2 to encourage different responses
                            response = await requestLLM(
                                [
                                    { role: "system", content: prompts[0] },
                                    { role: "user", content: prompts[1] },
                                ],
                                `${basename(dataset.path)}/${analyzer.name}`,
                                tries * 0.2 + (actionAiParams?.temperature ?? analyzer.baseTemperature),
                                actionAiParams?.fakeRequest ?? false,
                            );

                            logger.debug(
                                `[${dataset.name}/${key}] Received response, iteration ${iteration}`,
                            );

                            // Empty response indicates failure - return 0 to not advance cursor
                            if (response === "") {
                                return 0;
                            }
                        }
                        // Parse the LLM response to extract codes
                        // Returns either a number (cursor movement) or object mapping indices to codes
                        const itemRes = await analyzer.parseResponse(
                            analysis,
                            response.split("\n").map((Line) => Line.trim()),
                            currents,
                            chunkStart,
                            iteration,
                        );

                        // Handle relative cursor movement (analyzer-specific navigation)
                        if (typeof itemRes === "number") {
                            logger.debug(
                                `[${dataset.name}/${key}] Relative cursor movement: ${itemRes}`,
                            );
                            return itemRes;
                        }

                        // Process item-level codes
                        // itemRes maps item indices (1-based) to code strings
                        for (const [idx, res] of Object.entries(itemRes)) {
                            const message = currents[parseInt(idx) - 1];

                            // Detect delimiter: comma if no semicolons/pipes, otherwise semicolon/pipe
                            const isCommaDelim = !(res.includes(";") || res.includes("|"));

                            // Check if this is deductive coding (codebook has definitions)
                            const isDeductive = Object.values(analysis.codes).some(
                                (code) => (code.definitions?.length ?? 0) > 0,
                            );

                            // Parse and normalize codes from delimited string
                            const codes = (isDeductive ? res : res.toLowerCase())
                                .split(isCommaDelim ? /,/g : /\||;/g)
                                .map((c) =>
                                    isDeductive
                                        ? c.trim().replace(/\.$/, "")
                                        : c.trim().replace(/\.$/, "").toLowerCase(),
                                )
                                .filter(
                                    (c) =>
                                        c.length > 0 &&
                                        // Filter out invalid codes:
                                        c !== message.content.toLowerCase() && // Not just the message itself
                                        !c.endsWith("...") && // Not incomplete
                                        !c.endsWith("!") &&
                                        !c.endsWith("?") &&
                                        !c.endsWith(".") && // Not sentence fragments
                                        !c.endsWith(`p${message.uid}`), // Not participant IDs
                                );

                            logger.debug(
                                `[${dataset.name}/${key}] Received ${codes.length} codes for message ${message.id}: ${codes.join(", ")}`,
                            );

                            // Store codes for this item
                            analysis.items[message.id].codes = codes;

                            // Build codebook entries with examples
                            codes.forEach((code) => {
                                const cur = analysis.codes[code] ?? { label: code };
                                cur.examples = cur.examples ?? [];

                                // Format example with speaker and content
                                const content = assembleExampleFrom(dataset, message);

                                // Add example if non-empty and not already present
                                if (message.content !== "" && !cur.examples.includes(content)) {
                                    cur.examples.push(content);
                                    logger.debug(
                                        `[${dataset.name}/${key}] Added example for code ${code}: ${content}`,
                                    );
                                }
                                analysis.codes[code] = cur;
                            });
                        }

                        // Store analysis for next window's overlap processing
                        prevAnalysis = analysis;

                        // Calculate cursor movement based on items processed
                        // Negative if fewer items coded than in window (dial back)
                        // Positive if more items coded (skip ahead)
                        const movement = Object.keys(itemRes).length - currents.length;
                        logger.debug(`[${dataset.name}/${key}] Cursor movement: ${movement}`);
                        return movement;
                    },
                    undefined,
                    aiParams,
                );
            } catch (e) {
                // Wrap errors for better tracking and debugging
                const err = new CodeStep.InternalError("Failed to analyze chunk");
                err.cause = e;
                throw err;
            }

            // Increment iteration counter for this chunk's analysis
            analysis.iteration++;
            logger.info(`[${dataset.name}] Analyzed chunk ${key}, iteration ${analysis.iteration}`);
        }

        // Consolidate all codes into a unified codebook
        // Merges individual code entries, combines examples, builds hierarchies
        mergeCodebook(analyzed);

        return analyzed;
    });

/**
 * CodeStep - Applies qualitative codes to data items
 *
 * Responsibilities:
 * - AI Mode: Use LLMs with analyzer strategies to automatically code data
 * - Human Mode: Import codes from Excel files completed by human coders
 * - Export results to Excel and JSON for review/editing
 * - Build codebooks with codes, examples, and metadata
 * - Support multiple datasets, strategies, models, and coders
 *
 * Type Parameters:
 * - TSubunit: Type of data item (default: DataItem)
 * - TUnit: Type of data chunk (default: DataChunk<DataItem>)
 *
 * Execution Modes:
 *
 * AI Mode (agent: "AI"):
 * 1. For each dataset:
 *    a. For each strategy:
 *       - Initialize analyzer (or use provided instance)
 *       - For each chunk group:
 *         - Call analyzeChunks() to code all chunks
 *         - Export results to JSON and Excel
 *         - Store in results map
 *
 * Human Mode (agent: "Human"):
 * 1. For each dataset:
 *    a. Find coder files in configured directory
 *    b. For each coder:
 *       - Try loading from Excel (preferred)
 *       - Fall back to JSON if Excel fails
 *       - Handle missing/empty files per onMissing config
 *       - Build codebook from imported codes
 *       - Store in results map
 *
 * Results Structure:
 * results[dataset_name][analyzer_name][identifier] = CodedThreads
 * - dataset_name: Name of the dataset
 * - analyzer_name: "human" for human mode, strategy name for AI mode
 * - identifier: coder name (human) or "chunk_group-model" (AI)
 *
 * Pipeline Integration:
 * - Depends on LoadStep(s) for data
 * - Provides results to ConsolidateStep via getResult()
 * - Group name used to organize coders in consolidation
 */
export class CodeStep<
    TSubunit extends DataItem = DataItem,
    TUnit extends DataChunk<TSubunit> = DataChunk<TSubunit>,
> extends BaseStep {
    /**
     * Dependencies: LoadStep(s) providing the data to code
     */
    override dependsOn: LoadStep<TUnit>[];

    /**
     * Datasets loaded from dependencies (private until execution)
     */
    #datasets: Dataset<TUnit>[] = [];

    /**
     * Get the datasets being coded
     *
     * @throws UnexecutedError if step hasn't executed yet
     * @returns Array of datasets from LoadStep dependencies
     */
    get datasets() {
        // Sanity check - prevent access before execution
        if (!this.executed || !this.#datasets.length) {
            throw new CodeStep.UnexecutedError(logger.prefixed(this._prefix, "datasets"));
        }
        return this.#datasets;
    }

    /**
     * Group name for this coder (used in consolidation)
     *
     * Groups allow organizing multiple coding sources:
     * - "human" for human coders
     * - "ai" for AI coders
     * - Custom names for specific coder groups
     */
    group: string;

    /**
     * Coding results organized by dataset, analyzer, and identifier
     *
     * Structure: results[dataset][analyzer][ident] = CodedThreads
     * - dataset: Dataset name (e.g., "interview-study")
     * - analyzer: Analyzer name (e.g., "human", "thematic-analysis")
     * - ident: Specific identifier (coder name or "chunk-model")
     */
    #results = new Map<string, Record<string, Record<string, CodedThreads>>>();

    /**
     * Get coding results for a specific dataset
     *
     * @param dataset - Name of the dataset
     * @throws UnexecutedError if step hasn't executed yet
     * @throws InternalError if dataset not found
     * @returns Nested record of results by analyzer and identifier
     */
    getResult(dataset: string) {
        logger.withSource(this._prefix, "getResult", () => {
            // Sanity check - ensure execution completed
            if (!this.executed || !this.#results.size) {
                throw new CodeStep.UnexecutedError();
            }
            // Verify dataset exists in results
            if (!this.#results.has(dataset)) {
                throw new CodeStep.InternalError(`Dataset ${dataset} not found`);
            }
        });

        return this.#results.get(dataset) ?? {};
    }

    /**
     * Create a new CodeStep
     *
     * @param config - Configuration for AI or Human mode
     */
    constructor(private readonly config: CodeStepConfig<TSubunit, TUnit>) {
        super();

        // Setup dependencies: normalize to array
        // If no dataset specified, depends on all LoadSteps (configured elsewhere)
        this.dependsOn = config.dataset
            ? Array.isArray(config.dataset)
                ? config.dataset
                : [config.dataset]
            : [];

        // Initialize group name (defaults based on agent type)
        this.group = config.group ?? config.agent.toLowerCase();
    }

    async #codeAI() {
        await logger.withSource(this._prefix, "codeAI", async () => {
            // Sanity check
            if (this.config.agent !== "AI") {
                throw new CodeStep.InternalError(`Invalid agent ${this.config.agent}`);
            }

            const strategies = Array.isArray(this.config.strategy)
                ? this.config.strategy
                : [this.config.strategy];
            const models = Array.isArray(this.config.model)
                ? this.config.model
                : [this.config.model];

            // Load codebook if provided (for deductive coding)
            let codebook: Codebook | undefined;
            if (this.config.codebook) {
                if (typeof this.config.codebook === "string") {
                    logger.info(`Loading codebook from ${this.config.codebook}`);
                    codebook = readJSONFile(this.config.codebook);
                } else {
                    codebook = this.config.codebook;
                }
                if (codebook) {
                    logger.info(`Loaded codebook with ${Object.keys(codebook).length} codes`);
                }
            }

            logger.info(
                `Coding ${this.#datasets.length} datasets with strategies ${strategies.map((s) => s.name).join(", ")} and models ${models.map((m) => (typeof m === "string" ? m : m.name)).join(", ")}`,
            );

            for (const dataset of this.#datasets) {
                logger.info(`[${dataset.name}] Coding dataset`);
                for (const strategy of strategies) {
                    logger.info(`[${dataset.name}] Using strategy ${strategy.name}`);
                    await useLLMs(async (session) => {
                        await BaseStep.Context.with(
                            {
                                dataset,
                                session,
                            },
                            async () => {
                                // Sanity check
                                if (this.config.agent !== "AI") {
                                    throw new CodeStep.InternalError(
                                        `Invalid agent ${this.config.agent}`,
                                    );
                                }

                                // Instantiate analyzer (codebook handled separately in analyzeChunks)
                                const analyzer =
                                    strategy instanceof Analyzer ? strategy : new strategy();
                                logger.info(
                                    `[${dataset.name}/${analyzer.name}] Using model ${session.config.name}`,
                                );
                                // Analyze the chunks
                                const numChunks = Object.keys(dataset.data).length;
                                for (const [idx, [key, chunks]] of Object.entries(
                                    dataset.data,
                                ).entries()) {
                                    logger.info(
                                        `[${dataset.name}/${analyzer.name}] Analyzing chunk ${key} (${idx + 1}/${numChunks})`,
                                    );

                                    // Determine if using substeps or single-pass
                                    const substeps = this.config.parameters?.substeps;
                                    const passes = substeps?.length
                                        ? substeps
                                        : [{ name: "default", categoryFilter: undefined, customParameters: undefined }];

                                    let result: CodedThreads = { threads: {} };

                                    // Process each substep (or single default pass)
                                    for (const substep of passes) {
                                        if (substeps) {
                                            logger.info(`[${dataset.name}/${analyzer.name}/${key}] Substep: ${substep.name}`);
                                        }

                                        // Filter codebook for this substep
                                        const substepCodebook = substep.categoryFilter
                                            ? filterCodebookByCategory(codebook, substep.categoryFilter)
                                            : codebook;

                                        // Merge parameters: substep overrides base
                                        const mergedParams = {
                                            ...this.config.parameters,
                                            ...(substep.customParameters || {})
                                        };

                                        // Accumulate results using merged parameters
                                        result = await analyzeChunks(
                                            analyzer,
                                            chunks,
                                            result,  // Pass previous result to accumulate
                                            substepCodebook,
                                            mergedParams,
                                        );
                                    }

                                    logger.success(
                                        `[${dataset.name}/${analyzer.name}/${key}] Coded ${Object.keys(result.threads).length} threads (${idx + 1}/${numChunks})`,
                                    );

                                    const filename = `${key.replace(".json", "")}-${session.config.name}${analyzer.suffix}`;
                                    // Write the result into a JSON file
                                    const analyzerPath = ensureFolder(
                                        join(dataset.path, analyzer.name),
                                    );
                                    const jsonPath = join(analyzerPath, `${filename}.json`);
                                    logger.info(
                                        `[${dataset.name}/${analyzer.name}/${key}] Writing JSON result to ${jsonPath}`,
                                    );
                                    writeFileSync(jsonPath, JSON.stringify(result, null, 4));

                                    // Write the result into an Excel file
                                    const book = exportChunksForCoding(
                                        Object.values(chunks),
                                        result,
                                    );
                                    const excelPath = join(analyzerPath, `${filename}.xlsx`);
                                    logger.info(
                                        `[${dataset.name}/${analyzer.name}/${key}] Writing Excel result to ${excelPath}`,
                                    );
                                    await book.xlsx.writeFile(excelPath);

                                    // Store the result
                                    const cur = this.#results.get(dataset.name) ?? {};
                                    this.#results.set(dataset.name, {
                                        ...cur,
                                        [analyzer.name]: {
                                            ...(cur[analyzer.name] ?? {}),
                                            [filename]: result,
                                        },
                                    });
                                }
                            },
                        );
                    }, models);
                }
            }
        });
    }

    async #codeHuman() {
        await logger.withSource(this._prefix, "codeHuman", async () => {
            // Sanity check
            if (this.config.agent !== "Human") {
                throw new CodeStep.InternalError(`Invalid agent ${this.config.agent}`);
            }

            logger.info(`Coding ${this.#datasets.length} datasets with human`);

            for (const dataset of this.#datasets) {
                logger.info(`[${dataset.name}] Loading human codes`);

                const loadExcel = async (path: string, sheet?: string) => {
                    if (!existsSync(path)) {
                        logger.warn(`File ${path} does not exist`);
                        return;
                    }

                    try {
                        const analyses = await importCodes(dataset, path, sheet);
                        logger.info(`[${dataset.name}] Loaded codes via Excel from ${path}`);
                        return analyses;
                    } catch (error) {
                        logger.warn(
                            `[${dataset.name}] Failed to load codes via Excel from ${path}: ${error instanceof Error ? error.message : JSON.stringify(error)}, trying JSON`,
                        );
                    }
                };
                const loadJSON = (path: string) => {
                    if (!existsSync(path)) {
                        logger.warn(`File ${path} does not exist`);
                        return;
                    }

                    const analyses: CodedThreads = readJSONFile(path);
                    if (!("threads" in analyses)) {
                        throw new CodeStep.ConfigError(`Invalid JSON code file: ${path}`);
                    }
                    if (!analyses.codebook) {
                        buildCodes(dataset, analyses);
                        mergeCodebook(analyses);
                    }
                    logger.info(`[${dataset.name}] Loaded codes via JSON from ${path}`);
                    return analyses;
                };

                const basePath = ensureFolder(join(dataset.path, this.config.subdir ?? "human"));
                const coders = new Set(
                    this.config.coders ??
                        readdirSync(basePath)
                            .filter((file) => {
                                const ext = extname(file).toLowerCase();
                                return ext === ".xlsx" || ext === ".json";
                            })
                            .map((file) => basename(file, extname(file))),
                );

                if (!coders.size) {
                    throw new CodeStep.ConfigError(
                        `No coders found in ${basePath}; please provide a valid path or a list of coders`,
                    );
                }

                const codes: Record<string, CodedThreads> = {};
                for (const coder of coders) {
                    logger.info(`[${dataset.name}] Loading codes for coder "${coder}"`);
                    const excelPath = join(basePath, `${coder}.xlsx`);
                    let analyses =
                        (await loadExcel(excelPath, this.config.codebookSheet)) ??
                        loadJSON(join(basePath, `${coder}.json`));

                    // Check if analyses is empty
                    if (!analyses || !Object.keys(analyses.threads).length) {
                        if (!existsSync(excelPath)) {
                            logger.warn(
                                `[${dataset.name}] Exporting empty Excel workbook for coder "${coder}"`,
                            );
                            // Export empty Excel file
                            const book = exportChunksForCoding(
                                Object.values(dataset.data).flatMap((cg) => Object.values(cg)),
                            );
                            await book.xlsx.writeFile(excelPath);
                        }

                        let action = this.config.onMissing ?? "ask";
                        if (action === "ask") {
                            logger.lock();
                            action = await select({
                                message: `No analyses found for human coder "${coder}". What do you want to do?`,
                                choices: [
                                    { name: "Skip this coder", value: "skip" },
                                    {
                                        name: `Wait for coder to fill in ${excelPath}`,
                                        value: "wait",
                                    },
                                    { name: "Abort and exit", value: "abort" },
                                ],
                            });
                            logger.unlock();
                        }

                        logger.debug(`[${dataset.name}] Action for coder "${coder}": ${action}`);

                        if (action === "skip") {
                            logger.warn(`[${dataset.name}] Skipping coder "${coder}"`);
                            continue;
                        }

                        if (action === "abort") {
                            logger.warn(`[${dataset.name}] User requested to abort`);
                            this.abort();
                            return;
                        }

                        while (!analyses || !Object.keys(analyses.threads).length) {
                            logger.lock();
                            console.log(
                                `Waiting for coder "${coder}" to close the file at ${excelPath}...\n`,
                            );
                            await open(excelPath, { wait: true });
                            logger.unlock();
                            analyses = await loadExcel(excelPath, this.config.codebookSheet);
                        }
                    }

                    codes[coder] = analyses;
                    logger.success(
                        `[${dataset.name}] Loaded ${Object.keys(analyses.threads).length} threads from "${coder}"`,
                    );
                }

                if (!Object.keys(codes).length) {
                    logger.warn(
                        `[${dataset.name}] No codes loaded, did you skip all human coders?`,
                    );
                }

                // Store the result
                this.#results.set(dataset.name, {
                    human: codes,
                });
            }
        });
    }

    async #_execute() {
        this.#datasets = this.dependsOn.map((step) => step.dataset);
        logger.info(`Coding ${this.#datasets.length} datasets`);

        // Cast the agent to a generic string to perform runtime checks
        const agent = this.config.agent as string;
        if (agent === "AI") {
            await this.#codeAI();
        } else if (agent === "Human") {
            await this.#codeHuman();
        } else {
            throw new CodeStep.ConfigError(`Invalid agent ${agent}`);
        }

        this.executed = true;
    }

    override async execute() {
        await super.execute();

        await logger.withSource(this._prefix, "execute", true, this.#_execute.bind(this));
    }
}
