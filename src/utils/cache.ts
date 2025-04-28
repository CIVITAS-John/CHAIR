import { existsSync, readFileSync, writeFileSync } from "fs";

import type { IDStrFunc } from "../steps/base-step.js";

import { readJSONFile } from "./file.js";
import { logger } from "./logger.js";

/** Read or build a cache based on a hash. */
export const withCache = async <T>(
    idStr: IDStrFunc,
    cachePath: string,
    hash: string,
    task: () => Promise<T>,
) => {
    const _id = idStr("withCache");
    // Check if the cache exists
    if (existsSync(`${cachePath}.json`) && existsSync(`${cachePath}.hash`)) {
        if (hash === readFileSync(`${cachePath}.hash`, "utf8")) {
            logger.info(`Reading cache from ${cachePath}.json`, _id);
            return readJSONFile<T>(`${cachePath}.json`);
        }
    }
    logger.info(`Building cache at ${cachePath}.json`, _id);
    // Build and write the cache
    const data = await task();
    const content = JSON.stringify(data, null, 4);
    writeFileSync(`${cachePath}.json`, content);
    // Write the hash
    writeFileSync(`${cachePath}.hash`, hash);
    return data;
};
