import { existsSync, readFileSync, writeFileSync } from "fs";

import { readJSONFile } from "./file.js";
import { logger } from "./logger.js";

/** Read or build a cache based on a hash. */
export const withCache = <T>(cachePath: string, hash: string, task: () => Promise<T>) =>
    logger.withDefaultSource("withCache", async () => {
        // Check if the cache exists
        if (existsSync(`${cachePath}.json`) && existsSync(`${cachePath}.hash`)) {
            if (hash === readFileSync(`${cachePath}.hash`, "utf8")) {
                logger.info(`Reading cache from ${cachePath}.json`);
                return readJSONFile<T>(`${cachePath}.json`);
            }
        }
        logger.info(`Building cache at ${cachePath}.json`);
        // Build and write the cache
        const data = await task();
        const content = JSON.stringify(data, null, 4);
        writeFileSync(`${cachePath}.json`, content);
        // Write the hash
        writeFileSync(`${cachePath}.hash`, hash);
        return data;
    });
