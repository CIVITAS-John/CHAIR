/**
 * Load Step Module
 *
 * This module handles loading and initializing datasets from the filesystem.
 * It's the first step in the analysis pipeline, providing data for all subsequent steps.
 *
 * Data Loading Process:
 * 1. Load dataset configuration from configuration.js
 * 2. Load each chunk group (collection of related data chunks)
 * 3. Apply optional filters to remove unwanted data
 * 4. Parse and initialize data items with proper types
 * 5. Build the complete Dataset object with metadata
 *
 * Data Transformation:
 * - Raw string timestamps → Parsed Date objects
 * - Raw chunks → Initialized chunks with nested items
 * - Flat chunk groups → Structured hierarchical data
 *
 * Key Concepts:
 * - Dataset: Collection of chunk groups with metadata and research questions
 * - Chunk Group: Named collection of chunks (e.g., "interviews", "focus_groups")
 * - Chunk: Time-bounded collection of data items (messages, responses, etc.)
 * - Item: Individual data point (message, comment, response)
 *
 * Pipeline Integration:
 * - No dependencies (first step in pipeline)
 * - Provides dataset to downstream steps via the dataset getter
 * - Stores dataset in BaseStep.Context for global access
 */

import { join, resolve } from "path";

import type {
    DataChunk,
    DataItem,
    Dataset,
    RawDataChunk,
    RawDataItem,
    RawDataset,
} from "../schema.js";
import { importDefault, readJSONFile } from "../utils/io/file.js";
import { logger } from "../utils/core/logger.js";
import { parseDateTime } from "../utils/core/misc.js";

import { BaseStep } from "./base-step.js";

/**
 * Configuration for the LoadStep
 */
export interface LoadStepConfig {
    /**
     * Path to the dataset directory
     *
     * Must contain:
     * - configuration.js: Dataset metadata and chunk group definitions
     * - Data files referenced in configuration.js
     */
    path: string;

    /**
     * Optional filter to exclude chunks from analysis
     *
     * Receives the entire chunk group and returns filtered chunks.
     * Useful for:
     * - Removing test data
     * - Focusing on specific time periods
     * - Excluding certain participants
     *
     * @param data - All chunks in the chunk group
     * @returns Filtered chunk group (subset of input)
     */
    filter?: (data: Record<string, RawDataChunk>) => Record<string, RawDataChunk>;
}

/**
 * Load a chunk group from a JSON file
 *
 * @param datasetPath - Root path of the dataset
 * @param name - Filename of the chunk group (relative to datasetPath)
 * @returns Parsed chunk group as a record of chunks by ID
 */
const loadChunkGroup = (datasetPath: string, name: string) =>
    readJSONFile<Record<string, RawDataChunk>>(join(datasetPath, name));

/**
 * Initialize a data item by parsing its timestamp
 *
 * Converts raw string timestamps to Date objects for proper temporal analysis.
 *
 * @param item - Raw data item with string timestamp
 * @returns Initialized data item with parsed Date
 */
const initializeItem = (item: RawDataItem): DataItem => ({
    ...item,
    time: parseDateTime(item.time),
});

/**
 * Recursively initialize a data chunk and its nested items
 *
 * Data chunks can contain:
 * - Simple items (messages, responses)
 * - Nested chunks (subchunks for hierarchical data)
 *
 * This function:
 * 1. Parses chunk start/end timestamps
 * 2. Recursively processes nested chunks
 * 3. Initializes simple items with parsed timestamps
 *
 * @param chunk - Raw data chunk with string timestamps
 * @returns Initialized chunk with parsed Dates and processed items
 */
const initializeChunk = (chunk: RawDataChunk): DataChunk<DataItem> => ({
    ...chunk,
    start: parseDateTime(chunk.start),
    end: parseDateTime(chunk.end),
    items: chunk.items.map((item) => {
        // Check if item is a nested chunk (has 'items' property)
        if ("items" in item) {
            return initializeChunk(item);
        }
        // Otherwise it's a simple item
        return initializeItem(item);
    }),
});

/**
 * LoadStep - First step in the analysis pipeline
 *
 * Responsibilities:
 * - Load dataset configuration and metadata
 * - Load and parse data chunks from JSON files
 * - Initialize data with proper types (Date parsing)
 * - Apply optional filters to chunks
 * - Provide dataset to downstream steps
 *
 * Type Parameters:
 * - TUnit: Type of data chunk (default: DataChunk<DataItem>)
 *   Can be specialized for domain-specific chunk types
 *
 * Execution Flow:
 * 1. Validate configuration (path must be set)
 * 2. Load dataset configuration file
 * 3. For each chunk group:
 *    a. Load chunks from JSON file
 *    b. Apply filter if configured
 *    c. Initialize chunks with parsed timestamps
 * 4. Build complete Dataset object
 * 5. Store in context for downstream steps
 *
 * Example Configuration:
 * ```typescript
 * new LoadStep({
 *   path: "./data/my-dataset",
 *   filter: (chunks) => {
 *     // Only include chunks from 2024
 *     return Object.fromEntries(
 *       Object.entries(chunks).filter(([k, v]) =>
 *         v.start.startsWith("2024")
 *       )
 *     );
 *   }
 * })
 * ```
 */
export class LoadStep<TUnit extends DataChunk<DataItem> = DataChunk<DataItem>> extends BaseStep {
    /**
     * LoadStep has no dependencies - it's the first step in the pipeline
     */
    override dependsOn = undefined;

    /**
     * Loaded dataset (private until execution completes)
     */
    #dataset?: Dataset<TUnit>;

    /**
     * Get the loaded dataset
     *
     * Access the dataset loaded by this step. Used by downstream steps
     * to access data for analysis.
     *
     * @throws UnexecutedError if step hasn't executed yet
     * @returns The loaded and initialized dataset
     */
    get dataset() {
        // Sanity check - prevent access before execution
        if (!this.executed || !this.#dataset) {
            throw new LoadStep.UnexecutedError(logger.prefixed(this._prefix, "dataset"));
        }
        return this.#dataset;
    }

    /**
     * Create a new LoadStep
     *
     * @param config - Configuration specifying dataset path and optional filter
     */
    constructor(private readonly config: LoadStepConfig) {
        super();
    }

    /**
     * Internal execution logic for loading the dataset
     *
     * This method orchestrates the complete data loading process:
     *
     * Loading Phase:
     * 1. Validate configuration (path is required)
     * 2. Load configuration.js to get dataset metadata
     * 3. Log dataset info (name, title, chunk group count)
     *
     * Processing Phase:
     * For each chunk group defined in the dataset:
     * 1. Load raw chunks from JSON file
     * 2. Apply filter if configured (removing unwanted chunks)
     * 3. Skip empty chunk groups (after filtering)
     * 4. Initialize each chunk (parse timestamps, process items)
     * 5. Store parsed chunks in structured data object
     *
     * Finalization Phase:
     * 1. Build complete Dataset object with:
     *    - All loaded and parsed data
     *    - Resolved absolute path
     *    - Formatted research question
     *    - Speaker name resolver functions
     * 2. Mark step as executed
     *
     * Speaker Name Resolution:
     * - getSpeakerName: Maps IDs to names for analysis
     * - getSpeakerNameForExample: Maps IDs to names for examples (may anonymize)
     * - Both default to identity function if not provided
     *
     * @throws ConfigError if path is not configured
     */
    async #execute() {
        // Validate required configuration
        if (!this.config.path) {
            throw new LoadStep.ConfigError("config.path is required");
        }

        // Load dataset configuration
        logger.info(`Loading dataset from ${this.config.path}`);
        const dataset = (await importDefault(
            join(this.config.path, "configuration.js"),
        )) as RawDataset;
        logger.info(
            `Found dataset ${dataset.name} (${dataset.title}) with ${Object.keys(dataset.data).length} chunk groups`,
        );

        // Resolve to absolute path for consistent file operations
        this.config.path = resolve(this.config.path);
        const parsedData: Record<string, Record<string, TUnit>> = {};

        // Process each chunk group
        for (const [gk, gv] of Object.entries(dataset.data)) {
            logger.info(`[${dataset.name}] Loading chunk group "${gk}" from ${gv}`);
            let rawChunks = loadChunkGroup(this.config.path, gv);

            // Apply filter if configured
            if (this.config.filter) {
                logger.debug(`[${dataset.name}] Filtering chunk group "${gk}"`);
                rawChunks = this.config.filter(rawChunks);
            }

            // Skip empty chunk groups (may occur after filtering)
            if (!Object.keys(rawChunks).length) {
                logger.warn(`[${dataset.name}] Chunk group "${gk}" is empty, skipping...`);
                continue;
            }

            // Initialize all chunks in the group
            const parsedChunks: Record<string, TUnit> = {};
            for (const [ck, cv] of Object.entries(rawChunks)) {
                logger.debug(`[${dataset.name}] Initializing chunk "${ck}" of chunk group "${gk}"`);
                parsedChunks[ck] = initializeChunk(cv) as TUnit;
            }
            parsedData[gk] = parsedChunks;

            logger.info(
                `[${dataset.name}] Loaded chunk group "${gk}" with ${Object.keys(parsedChunks).length} chunks`,
            );
        }

        // Build complete dataset with speaker name resolvers
        const getSpeakerName = dataset.getSpeakerName ?? ((id: string) => id);
        this.#dataset = {
            ...dataset,
            path: this.config.path,
            data: parsedData,
            researchQuestion: `The research question is: ${dataset.researchQuestion}`,
            getSpeakerName,
            getSpeakerNameForExample: dataset.getSpeakerNameForExample ?? getSpeakerName,
        };
        logger.success(`Loaded dataset ${dataset.name}`);

        this.executed = true;
    }

    /**
     * Execute the LoadStep
     *
     * Calls base class validation then runs the internal loading logic.
     * All logging is scoped to this step for clear output.
     *
     * @returns Promise that resolves when loading completes
     */
    override async execute() {
        await super.execute();

        await logger.withSource(this._prefix, "execute", true, this.#execute.bind(this));
    }
}
