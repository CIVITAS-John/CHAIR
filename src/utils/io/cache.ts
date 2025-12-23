/**
 * JSON Cache with Hash-Based Invalidation
 *
 * This module provides a simple caching mechanism for expensive operations (like data transformations).
 * It uses a separate hash file to detect when cached data is stale and needs rebuilding.
 *
 * Cache Strategy:
 * - Two files per cache: {path}.json (data) and {path}.hash (validation)
 * - Hash file contains a string hash representing the input state
 * - Cache is valid only if both files exist AND hash matches
 * - If invalid, task is executed and results are cached
 *
 * Hash Generation:
 * - Caller is responsible for generating a meaningful hash
 * - Common approach: hash of input file paths, configuration, or data checksums
 * - Collisions are NOT acceptable here (unlike LLM/embedding caches) - use strong hashing
 *
 * Use Cases:
 * - Expensive data transformations that depend on input files
 * - Processing that takes minutes but input rarely changes
 * - Build-time optimizations where you need reproducibility
 */

import { existsSync, readFileSync, writeFileSync } from "fs";

import { readJSONFile } from "./file.js";
import { logger } from "../core/logger.js";

/**
 * Execute a task with JSON caching and hash-based invalidation
 *
 * Checks if a valid cache exists (both .json and .hash files, with matching hash).
 * If valid, returns cached data. Otherwise, executes task, caches result, and returns it.
 *
 * @template T - Type of the cached data
 * @param cachePath - Base path for cache files (will create .json and .hash)
 * @param hash - Hash string representing current input state (invalidates cache if changed)
 * @param task - Async function to execute if cache is invalid
 * @returns Cached or freshly computed data
 *
 * @example
 * const processedData = await withCache(
 *   "cache/processed-users",
 *   md5(JSON.stringify(inputFiles)),
 *   async () => {
 *     // Expensive processing here
 *     return processUsers(inputFiles);
 *   }
 * );
 */
export const withCache = <T>(cachePath: string, hash: string, task: () => Promise<T>) =>
    logger.withDefaultSource("withCache", async () => {
        // Check if the cache exists and is valid
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
        // Write the hash for future validation
        writeFileSync(`${cachePath}.hash`, hash);
        return data;
    });
