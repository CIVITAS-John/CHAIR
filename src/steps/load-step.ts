import { join, resolve } from "path";

import type {
    DataChunk,
    DataItem,
    Dataset,
    RawDataChunk,
    RawDataItem,
    RawDataset,
} from "../schema.js";
import { importDefault, readJSONFile } from "../utils/file.js";
import { logger } from "../utils/logger.js";
import { parseDateTime } from "../utils/misc.js";

import { BaseStep } from "./base-step.js";

export interface LoadStepConfig {
    path: string; // Defaults to?
    // Passes the entire chunk group to the filter in case only certain messages are needed
    filter?: (data: Record<string, RawDataChunk>) => Record<string, RawDataChunk>;
}

const loadChunkGroup = (datasetPath: string, name: string) =>
    readJSONFile<Record<string, RawDataChunk>>(join(datasetPath, name));

const initializeItem = (item: RawDataItem): DataItem => ({
    ...item,
    time: parseDateTime(item.time),
});

const initializeChunk = (chunk: RawDataChunk): DataChunk<DataItem> => ({
    ...chunk,
    start: parseDateTime(chunk.start),
    end: parseDateTime(chunk.end),
    items: chunk.items.map((item) => {
        if ("items" in item) {
            return initializeChunk(item);
        }
        return initializeItem(item);
    }),
});

export class LoadStep<TUnit extends DataChunk<DataItem> = DataChunk<DataItem>> extends BaseStep {
    override dependsOn = undefined;

    #dataset?: Dataset<TUnit>;
    get dataset() {
        // Sanity check
        if (!this.executed || !this.#dataset) {
            throw new LoadStep.UnexecutedError(logger.prefixed(this._prefix, "dataset"));
        }
        return this.#dataset;
    }

    constructor(private readonly config: LoadStepConfig) {
        super();
    }

    async #execute() {
        if (!this.config.path) {
            throw new LoadStep.ConfigError("config.path is required");
        }

        logger.info(`Loading dataset from ${this.config.path}`);
        const dataset = (await importDefault(
            join(this.config.path, "configuration.js"),
        )) as RawDataset;
        logger.info(
            `Found dataset ${dataset.name} (${dataset.title}) with ${Object.keys(dataset.data).length} chunk groups`,
        );

        this.config.path = resolve(this.config.path);
        const parsedData: Record<string, Record<string, TUnit>> = {};
        for (const [gk, gv] of Object.entries(dataset.data)) {
            logger.info(`[${dataset.name}] Loading chunk group "${gk}" from ${gv}`);
            let rawChunks = loadChunkGroup(this.config.path, gv);

            if (this.config.filter) {
                logger.debug(`[${dataset.name}] Filtering chunk group "${gk}"`);
                rawChunks = this.config.filter(rawChunks);
            }

            if (!Object.keys(rawChunks).length) {
                logger.warn(`[${dataset.name}] Chunk group "${gk}" is empty, skipping...`);
                continue;
            }

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

    override async execute() {
        await super.execute();

        await logger.withSource(this._prefix, "execute", true, this.#execute.bind(this));
    }
}
