import { join, resolve } from "path";

import { logger } from "../logger";
import type {
    DataChunk,
    DataItem,
    Dataset,
    RawDataChunk,
    RawDataItem,
    RawDataset,
} from "../schema";
import { importDefault, parseDateTime, readJSONFile } from "../utils";

import { BaseStep } from "./base-step";

export interface LoadStepConfig {
    path?: string; // Defaults to?
    // Passes the entire chunk group to the filter in case only certain messages are needed
    filter?: (data: Record<string, RawDataChunk>) => Record<string, RawDataChunk>;
}

const loadChunkGroup = (datasetPath: string, name: string) =>
    readJSONFile<Record<string, RawDataChunk>>(join(resolve(datasetPath), name));

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

export class LoadStep<T extends DataChunk<DataItem> = DataChunk<DataItem>> extends BaseStep {
    _type = "Load";
    dataset?: Dataset<T>;

    constructor(private readonly config: LoadStepConfig) {
        super();
    }

    async execute() {
        if (!this.config.path) {
            // TODO: Set some default path
            throw new Error("Path is required for LoadStep.");
        }

        logger.info(`Loading dataset from ${this.config.path}`, `${this._id} LoadStep#execute`);
        const dataset = (await importDefault(
            join(this.config.path, "configuration.js"),
        )) as RawDataset;
        logger.info(
            `Loaded dataset "${dataset.title}" with ${Object.keys(dataset.data).length} chunk groups`,
            `${this._id} LoadStep#execute`,
        );

        const parsedData: Record<string, Record<string, T>> = {};
        for (const [gk, gv] of Object.entries(dataset.data)) {
            logger.info(
                `[${dataset.title}] Loading chunk group "${gk}" from ${gv}`,
                `${this._id} LoadStep#execute`,
            );
            let rawChunks = loadChunkGroup(this.config.path, gv);

            if (this.config.filter) {
                logger.debug(
                    `[${dataset.title}] Filtering chunk group "${gk}"`,
                    `${this._id} LoadStep#execute`,
                );
                rawChunks = this.config.filter(rawChunks);
            }

            if (!Object.keys(rawChunks).length) {
                logger.warn(
                    `[${dataset.title}] Chunk group "${gk}" is empty, skipping...`,
                    `${this._id} LoadStep#execute`,
                );
                continue;
            }

            const parsedChunks: Record<string, T> = {};
            for (const [ck, cv] of Object.entries(rawChunks)) {
                logger.debug(
                    `[${dataset.title}] Initializing chunk "${ck}" of chunk group "${gk}"`,
                    `${this._id} LoadStep#execute`,
                );
                parsedChunks[ck] = initializeChunk(cv) as T;
            }
            parsedData[gk] = parsedChunks;

            logger.info(
                `[${dataset.title}] Loaded chunk group "${gk}" with ${Object.keys(parsedChunks).length} chunks`,
                `${this._id} LoadStep#execute`,
            );
        }

        this.dataset = {
            ...dataset,
            data: parsedData,
        };
        logger.info(`Loaded dataset "${dataset.title}"`, `${this._id} LoadStep#execute`);
    }
}
