/**
 * LoadJsonStep Module
 *
 * JSON-specific implementation of the LoadStep abstract class.
 * Handles loading datasets from JSON files with a configuration.js file.
 *
 * Data Loading Process:
 * 1. Load dataset configuration from configuration.js
 * 2. Load each chunk group (collection of related data chunks) from JSON files
 * 3. Apply optional filters to remove unwanted data
 * 4. Parse and initialize data items with proper types
 * 5. Build the complete Dataset object with metadata
 *
 * Data Transformation:
 * - Raw string timestamps → Parsed Date objects
 * - Raw chunks → Initialized chunks with nested items
 * - Flat chunk groups → Structured hierarchical data
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
import { LoadStep } from "../steps/load-step.js";
import { importDefault, readJSONFile } from "../utils/io/file.js";
import { logger } from "../utils/core/logger.js";
import { parseDateTime } from "../utils/core/misc.js";

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
 * 4. Applies optional postprocess callback to items
 *
 * @param chunk - Raw data chunk with string timestamps
 * @param postprocessItem - Optional callback to transform DataItems
 * @returns Initialized chunk with parsed Dates and processed items
 */
const initializeChunk = (
    chunk: RawDataChunk,
    postprocessItem?: (item: DataItem) => DataItem,
): DataChunk<DataItem> => ({
    ...chunk,
    start: parseDateTime(chunk.start),
    end: parseDateTime(chunk.end),
    items: chunk.items.map((item) => {
        // Check if item is a nested chunk (has 'items' property)
        if ("items" in item) {
            return initializeChunk(item, postprocessItem);
        }
        // Otherwise it's a simple item
        let initializedItem = initializeItem(item);
        // Apply postprocess callback if provided
        if (postprocessItem) {
            initializedItem = postprocessItem(initializedItem);
        }
        return initializedItem;
    }),
});

/**
 * LoadJsonStep - JSON file implementation of LoadStep
 *
 * Loads datasets from a directory structure with:
 * - configuration.js: Dataset metadata and chunk group definitions
 * - JSON files: Data chunks referenced in configuration.js
 *
 * Type Parameters:
 * - TUnit: Type of data chunk (default: DataChunk<DataItem>)
 *   Can be specialized for domain-specific chunk types
 *
 * Execution Flow:
 * 1. Load dataset configuration from configuration.js
 * 2. For each chunk group defined in the dataset:
 *    a. Load raw chunks from JSON file
 *    b. Apply filter if configured (removing unwanted chunks)
 *    c. Skip empty chunk groups (after filtering)
 *    d. Initialize each chunk (parse timestamps, process items)
 * 3. Build complete Dataset object with speaker name resolvers
 *
 * Example Usage:
 * ```typescript
 * const loadStep = new LoadJsonStep({
 *   path: "./data/my-dataset",
 *   filter: (chunks) => {
 *     // Only include chunks from 2024
 *     return Object.fromEntries(
 *       Object.entries(chunks).filter(([k, v]) =>
 *         v.start.startsWith("2024")
 *       )
 *     );
 *   }
 * });
 * ```
 */
export class LoadJsonStep<TUnit extends DataChunk<DataItem> = DataChunk<DataItem>> extends LoadStep<TUnit> {
    /**
     * Load dataset from JSON files
     *
     * This method orchestrates the complete data loading process:
     *
     * Loading Phase:
     * 1. Load configuration.js to get dataset metadata
     * 2. Log dataset info (name, title, chunk group count)
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
     *
     * Speaker Name Resolution:
     * - getSpeakerName: Maps IDs to names for analysis
     * - getSpeakerNameForExample: Maps IDs to names for examples (may anonymize)
     * - Both default to identity function if not provided
     *
     * @returns Promise resolving to the loaded Dataset
     */
    protected async _load(): Promise<Dataset<TUnit>> {
        // Load dataset configuration
        logger.info(`Loading dataset from ${this.config.path}`);
        const dataset = (await importDefault(
            join(this.config.path, "configuration.js"),
        )) as RawDataset;
        logger.info(
            `Found dataset ${dataset.name} (${dataset.title}) with ${Object.keys(dataset.data).length} chunk groups`,
        );

        // Resolve to absolute path for consistent file operations
        const resolvedPath = resolve(this.config.path);
        const parsedData: Record<string, Record<string, TUnit>> = {};

        // Process each chunk group
        for (const [gk, gv] of Object.entries(dataset.data)) {
            logger.info(`[${dataset.name}] Loading chunk group "${gk}" from ${gv}`);
            let rawChunks = loadChunkGroup(resolvedPath, gv);

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
                parsedChunks[ck] = initializeChunk(cv, this.config.postprocessItem) as TUnit;
            }
            parsedData[gk] = parsedChunks;

            logger.info(
                `[${dataset.name}] Loaded chunk group "${gk}" with ${Object.keys(parsedChunks).length} chunks`,
            );
        }

        // Build complete dataset with speaker name resolvers
        const getSpeakerName = dataset.getSpeakerName ?? ((id: string) => id);
        return {
            ...dataset,
            path: resolvedPath,
            data: parsedData,
            researchQuestion: `The research question is: ${dataset.researchQuestion}`,
            getSpeakerName,
            getSpeakerNameForExample: dataset.getSpeakerNameForExample ?? getSpeakerName,
        };
    }
}