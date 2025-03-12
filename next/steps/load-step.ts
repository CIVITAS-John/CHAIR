import { GetMessagesPath } from "../../utils/loader";
import { logger } from "../logger";
import type {
    DataChunk,
    DataItem,
    Dataset,
    RawDataChunk,
    RawDataItem,
    RawDataset,
} from "../schema";
import { importDefault, readJSONFile } from "../utils";

import { BaseStep } from "./base-step";

export interface LoadStepConfig {
    path?: string; // Defaults to?
    // Passes the entire chunk group to the filter in case only certain messages are needed
    filter?: (data: Record<string, RawDataChunk>) => Record<string, RawDataChunk>;
}

const loadChunkGroup = (datasetPath: string, name: string) =>
    readJSONFile<Record<string, RawDataChunk>>(GetMessagesPath(datasetPath, name));

const initializeItem = (item: RawDataItem): DataItem => {
    let datetime = item.time;
    // If it is only a time, add a date
    if (/^\d{2}:\d{2}:\d{2}$/.exec(datetime)) {
        datetime = `1970-01-01T${datetime}`;
    }
    return {
        ...item,
        // Parse the datetime as a date
        time: new Date(datetime),
    };
};

const initializeChunk = (chunk: RawDataChunk): DataChunk<DataItem> => ({
    ...chunk,
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

        logger.info(`Loading dataset from ${this.config.path}`, `LoadStep${this._id}#execute`);
        const dataset = (await importDefault(
            GetMessagesPath(this.config.path, "configuration.js"),
        )) as RawDataset;
        logger.info(
            `Loaded dataset "${dataset.title}" with ${Object.keys(dataset.data).length} chunk groups`,
            `LoadStep${this._id}#execute`,
        );

        const parsedData: Record<string, Record<string, T>> = {};
        for (const [gk, gv] of Object.entries(dataset.data)) {
            logger.info(
                `["${dataset.title}"] Loading chunk group "${gk}" from ${gv}`,
                `LoadStep${this._id}#execute`,
            );
            let rawChunks = loadChunkGroup(this.config.path, gv);

            if (this.config.filter) {
                logger.debug(
                    `["${dataset.title}"] Filtering chunk group "${gk}"`,
                    `LoadStep${this._id}#execute`,
                );
                rawChunks = this.config.filter(rawChunks);
            }

            if (!Object.keys(rawChunks).length) {
                logger.warn(
                    `["${dataset.title}"] Chunk group "${gk}" is empty, skipping...`,
                    `LoadStep${this._id}#execute`,
                );
                continue;
            }

            const parsedChunks: Record<string, T> = {};
            for (const [ck, cv] of Object.entries(rawChunks)) {
                logger.debug(
                    `["${dataset.title}"] Initializing chunk "${ck}" of chunk group "${gk}"`,
                    `LoadStep${this._id}#execute`,
                );
                parsedChunks[ck] = initializeChunk(cv) as T;
            }
            parsedData[gk] = parsedChunks;

            logger.info(
                `["${dataset.title}"] Loaded chunk group "${gk}" with ${Object.keys(parsedChunks).length} chunks`,
                `LoadStep${this._id}#execute`,
            );
        }

        this.dataset = {
            ...dataset,
            data: parsedData,
        };
        logger.info(`Finished loading dataset "${dataset.title}"`, `LoadStep${this._id}#execute`);
    }
}
