/**
 * LoadQdpxStep Module
 *
 * QDPX-specific implementation of the LoadStep abstract class.
 * Handles loading datasets from REFI-QDA QDPX files.
 *
 * Data Loading Process:
 * 1. Convert QDPX file to JSON format using convertQdpxToJson utility
 * 2. Delegate dataset loading to LoadJsonStep parent class
 * 3. Load coded threads from human/*.json files
 * 4. Provide access to both dataset and coded threads
 *
 * QDPX files are zip archives containing:
 * - project.qde: Project XML with metadata, codebook, and text sources
 * - Sources/: Text files referenced by the project
 *
 * The conversion creates:
 * - sources.json: RawDataChunks with paragraphs as DataItems
 * - configuration.js: Dataset metadata
 * - human/{CoderName}.json: CodedThreads per coder
 */

import { join, resolve, dirname, basename } from "path";
import { mkdir } from "fs/promises";
import { existsSync } from "fs";

import type {
    DataChunk,
    DataItem,
    Dataset,
    CodedThread,
} from "../schema.js";
import { LoadJsonStep } from "./load-json-step.js";
import { convertQdpxToJson } from "../utils/io/qdpx.js";
import { readJSONFile } from "../utils/io/file.js";
import { logger } from "../utils/core/logger.js";

/**
 * Configuration for LoadQdpxStep
 */
export interface LoadQdpxStepConfig {
    /**
     * Path to the QDPX file
     */
    path: string;

    /**
     * Optional output directory for converted JSON files
     * If not specified, creates a directory next to the QDPX file
     */
    outputDir?: string;

    /**
     * Whether to skip conversion if output already exists
     * Default: true
     */
    skipIfExists?: boolean;
}

/**
 * LoadQdpxStep - QDPX file implementation of LoadStep
 *
 * Loads datasets from REFI-QDA QDPX files by:
 * 1. Converting QDPX to JSON format (automatically unzips)
 * 2. Using LoadJsonStep to load the dataset
 * 3. Loading coded threads from human/*.json files
 *
 * Type Parameters:
 * - TUnit: Type of data chunk (default: DataChunk<DataItem>)
 *
 * Execution Flow:
 * 1. Check if conversion needed (or skip if exists)
 * 2. Convert QDPX to JSON format:
 *    a. Unzip QDPX file
 *    b. Parse project.qde XML file
 *    c. Convert codebook with bottom-up filtering
 *    d. Convert TextSources to RawDataChunks (paragraphs as items)
 *    e. Extract coded segments per coder
 *    f. Write JSON files (sources.json, configuration.js, human/*.json)
 * 3. Load dataset using parent LoadJsonStep
 * 4. Load coded threads from human directory
 *
 * Example Usage:
 * ```typescript
 * const loadStep = new LoadQdpxStep({
 *   path: "./data/my-project.qdpx",
 *   outputDir: "./data/my-project-json"
 * });
 * await loadStep.execute();
 * const dataset = loadStep.dataset;
 * const codedThreads = loadStep.codedThreads;
 * ```
 */
export class LoadQdpxStep<TUnit extends DataChunk<DataItem> = DataChunk<DataItem>> extends LoadJsonStep<TUnit> {
    /**
     * Loaded coded threads (private until execution completes)
     */
    #codedThreads?: Map<string, CodedThread>;

    /**
     * Get the loaded coded threads
     *
     * Access the coded threads loaded from human/*.json files.
     * Each entry maps a coder name to their CodedThread data.
     *
     * @throws UnexecutedError if step hasn't executed yet
     * @returns Map of coder name to CodedThread
     */
    get codedThreads(): Map<string, CodedThread> {
        if (!this.executed || !this.#codedThreads) {
            throw new LoadQdpxStep.UnexecutedError(
                logger.prefixed(this._prefix, "codedThreads"),
            );
        }
        return this.#codedThreads;
    }

    /**
     * Configuration for this step
     */
    private readonly qdpxConfig: LoadQdpxStepConfig;

    /**
     * Create a new LoadQdpxStep
     *
     * @param config - Configuration specifying QDPX file path and output directory
     */
    constructor(config: LoadQdpxStepConfig) {
        // Determine output directory
        const outputDir =
            config.outputDir ||
            join(dirname(config.path), basename(config.path, ".qdpx") + "-json");

        // Pass output directory to parent LoadJsonStep
        super({ path: outputDir });

        this.qdpxConfig = config;
    }

    /**
     * Load coded threads from human/*.json files
     *
     * @param humanDir - Path to human directory
     * @returns Map of coder name to CodedThread
     */
    private async loadCodedThreads(humanDir: string): Promise<Map<string, CodedThread>> {
        const codedThreads = new Map<string, CodedThread>();

        if (!existsSync(humanDir)) {
            logger.warn(`Human directory not found: ${humanDir}`);
            return codedThreads;
        }

        // Read all .json files in human directory
        const { readdirSync } = await import("fs");
        const files = readdirSync(humanDir).filter((f) => f.endsWith(".json"));

        for (const file of files) {
            const coderName = file.replace(/\.json$/i, "").replace(/_/g, " ");
            const filePath = join(humanDir, file);

            try {
                const data = await readJSONFile<{ threads: Record<string, CodedThread> }>(
                    filePath,
                );

                // Store each thread separately (though typically one per coder per source)
                // For simplicity, we'll merge all threads into one per coder
                const mergedThread: CodedThread = {
                    id: coderName,
                    codes: {},
                    items: {},
                    iteration: 0,
                };

                for (const [threadId, thread] of Object.entries(data.threads)) {
                    // Merge items
                    Object.assign(mergedThread.items, thread.items);
                    // Merge codes
                    Object.assign(mergedThread.codes, thread.codes || {});
                }

                codedThreads.set(coderName, mergedThread);
                logger.debug(
                    `Loaded coded thread for coder "${coderName}" with ${Object.keys(mergedThread.items).length} items`,
                );
            } catch (error) {
                logger.error(`Failed to load coded thread from ${filePath}: ${error}`);
            }
        }

        return codedThreads;
    }

    /**
     * Load dataset from QDPX file
     *
     * This method orchestrates the QDPX loading process:
     *
     * Conversion Phase:
     * 1. Check if conversion is needed
     * 2. Convert QDPX to JSON format if needed:
     *    - Unzip QDPX file
     *    - Parse project.qde XML
     *    - Convert codebook
     *    - Convert TextSources to RawDataChunks
     *    - Extract coded segments
     *    - Write JSON files
     *
     * Loading Phase:
     * 1. Use parent LoadJsonStep to load dataset
     * 2. Load coded threads from human directory
     *
     * @returns Promise resolving to the loaded Dataset
     */
    protected override async _load(): Promise<Dataset<TUnit>> {
        const qdpxPath = resolve(this.qdpxConfig.path);
        const outputDir = resolve(this.config.path);

        // Check if conversion needed
        const skipIfExists = this.qdpxConfig.skipIfExists ?? true;
        const configPath = join(outputDir, "configuration.js");
        const needsConversion = !skipIfExists || !existsSync(configPath);

        if (needsConversion) {
            logger.info(`Converting QDPX file: ${qdpxPath}`);
            logger.info(`Output directory: ${outputDir}`);

            // Create output directory
            await mkdir(outputDir, { recursive: true });

            // Convert QDPX to JSON
            await convertQdpxToJson(qdpxPath, outputDir);

            logger.success(`QDPX conversion complete`);
        } else {
            logger.info(`Skipping QDPX conversion (output exists): ${outputDir}`);
        }

        // Load dataset using parent LoadJsonStep
        const dataset = await super._load();

        // Load coded threads
        const humanDir = join(outputDir, "human");
        this.#codedThreads = await this.loadCodedThreads(humanDir);

        logger.info(
            `Loaded ${this.#codedThreads.size} coded thread(s) from ${this.#codedThreads.size} coder(s)`,
        );

        return dataset;
    }
}
