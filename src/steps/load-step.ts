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

import type {
    DataChunk,
    DataItem,
    Dataset,
    RawDataChunk,
} from "../schema.js";
import { logger } from "../utils/core/logger.js";

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

    /**
     * Optional callback to postprocess each DataItem after it's fetched
     *
     * Applied after timestamp parsing but before the item is stored.
     * Useful for:
     * - Normalizing content formats
     * - Adding computed fields
     * - Filtering or transforming item properties
     *
     * @param item - The DataItem after initialization
     * @returns Transformed DataItem
     */
    postprocessItem?: (item: DataItem) => DataItem;
}

/**
 * LoadStep - Abstract base class for dataset loading steps
 *
 * This is the first step in the analysis pipeline, responsible for loading
 * and initializing datasets for all subsequent steps.
 *
 * Responsibilities:
 * - Define common interface for dataset loading
 * - Provide dataset to downstream steps
 * - Handle step lifecycle and validation
 *
 * Type Parameters:
 * - TUnit: Type of data chunk (default: DataChunk<DataItem>)
 *   Can be specialized for domain-specific chunk types
 *
 * Implementation Requirements:
 * Concrete subclasses must implement the _load() method to handle
 * specific data loading logic (JSON, CSV, databases, etc.)
 *
 * Example Implementation:
 * ```typescript
 * class LoadJsonStep extends LoadStep {
 *   protected async _load(): Promise<Dataset> {
 *     // Custom loading logic here
 *   }
 * }
 * ```
 */
export abstract class LoadStep<TUnit extends DataChunk<DataItem> = DataChunk<DataItem>> extends BaseStep {
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
    constructor(protected readonly config: LoadStepConfig) {
        super();
    }

    /**
     * Abstract method for loading dataset
     *
     * Concrete subclasses must implement this method to handle specific
     * data loading logic (JSON files, CSV, databases, APIs, etc.)
     *
     * @returns Promise resolving to the loaded Dataset
     */
    protected abstract _load(): Promise<Dataset<TUnit>>;

    /**
     * Internal execution logic
     *
     * Validates configuration and delegates to the abstract _load method
     * implemented by concrete subclasses.
     *
     * @throws ConfigError if path is not configured
     */
    async #execute() {
        // Validate required configuration
        if (!this.config.path) {
            throw new LoadStep.ConfigError("config.path is required");
        }

        // Delegate to concrete implementation
        this.#dataset = await this._load();
        logger.success(`Loaded dataset ${this.#dataset.name}`);

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
