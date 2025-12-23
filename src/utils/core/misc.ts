/**
 * Core Utility Functions
 *
 * Collection of general-purpose utility functions used throughout the application.
 * Includes async helpers, data manipulation, and dataset processing utilities.
 */

import type { DataChunk, DataItem, Dataset } from "../../schema.js";

/**
 * Reverse a string character by character
 *
 * @param s - String to reverse
 * @returns Reversed string
 *
 * @example
 * reverse("hello") // Returns "olleh"
 */
export const reverse = (s: string) => s.split("").reverse().join("");

/**
 * Sleep for a specified duration
 *
 * Returns a promise that resolves after the specified milliseconds.
 * Useful for rate limiting, retry delays, or simulating async operations.
 *
 * @param ms - Duration to sleep in milliseconds
 * @returns Promise that resolves to true after the delay
 *
 * @example
 * await sleep(1000); // Wait for 1 second
 */
export const sleep = (ms: number) =>
    new Promise<true>((resolve) => {
        const timeout = setTimeout(() => {
            clearTimeout(timeout);
            resolve(true);
        }, ms);
    });

/**
 * Race a promise against a timeout
 *
 * Wraps a promise with a timeout to prevent indefinite hangs. If the promise
 * doesn't resolve/reject within the time limit, throws the timeout error.
 *
 * @template T - Type of the promise result
 * @param promise - Promise to race against timeout
 * @param time - Timeout duration in milliseconds
 * @param timeoutError - Error to throw on timeout (default: "Sorry, the AI stopped responding.")
 * @returns Promise result if it completes in time
 * @throws {Error} timeoutError if timeout is exceeded
 *
 * @example
 * const result = await promiseWithTimeout(
 *   fetchData(),
 *   5000,
 *   new Error("Request timed out")
 * );
 */
export const promiseWithTimeout = async <T>(
    promise: Promise<T>,
    time: number,
    timeoutError = new Error("Sorry, the AI stopped responding."),
) => {
    let pid: NodeJS.Timeout | undefined;
    // Create a promise that rejects in milliseconds
    const timeout = new Promise<never>((_, reject) => {
        pid = setTimeout(() => {
            reject(timeoutError);
        }, time);
    });
    // Returns a race between timeout and the passed promise
    try {
        return await Promise.race<T>([promise, timeout]);
    } finally {
        clearTimeout(pid);
    }
};

export const parseDateTime = (datetime: string) => {
    // If it is only a time, add a date
    if (/^\d{2}:\d{2}:\d{2}$/.exec(datetime)) {
        datetime = `1970-01-01T${datetime}`;
    }
    const date = new Date(datetime);
    if (isNaN(date.getTime())) {
        return new Date("1970-01-01T00:00:00Z");
    }
    return date;
};

/** Generate a seeded random number. */
const seededRand = (seed: number) => {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
};

/**
 * Shuffle an array using a seed.
 * @see https://stackoverflow.com/questions/16801687/javascript-random-ordering-with-seed
 */
export const seededShuffle = <T>(array: T[], seed: number) => {
    let m = array.length,
        t,
        i;
    // While there remain elements to shuffle...
    while (m) {
        // Pick a remaining element...
        i = Math.floor(seededRand(seed) * m--);
        // And swap it with the current element.
        t = array[m];
        array[m] = array[i];
        array[i] = t;
        ++seed;
    }
    return array;
};

/** Get the median of an array. */
export const getMedian = (arr: number[]) => {
    if (arr.length === 0) return 0;
    if (arr.length === 1) return arr[0];
    const mid = Math.floor(arr.length / 2),
        nums = [...arr].sort((a, b) => a - b);
    return arr.length % 2 !== 0 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
};

// /** GetCategories: Get the categories from the codebook. */
// export function GetCategories(Codebook: Codebook): Map<string, string[]> {
//     const Categories = new Map<string, string[]>();
//     for (const Code of Object.values(Codebook)) {
//         for (const Category of Code.categories ?? []) {
//             if (Category === "") {
//                 continue;
//             }
//             if (!Categories.has(Category)) {
//                 Categories.set(Category, []);
//             }
//             if (!Categories.get(Category)!.includes(Code.label)) {
//                 Categories.get(Category)!.push(Code.label);
//             }
//         }
//     }
//     return Categories;
// }

/**
 * Assemble an example string with ID, speaker name, and content
 *
 * Uses the "|||" separator convention to separate ID from content.
 * Format: "ID|||SpeakerName: Content"
 *
 * The "|||" separator is used because:
 * - Unlikely to appear naturally in user content
 * - Easy to split on for parsing
 * - Converts to ": " for display (see export.ts)
 *
 * @param getSpeakerNameForExample - Function to get display name for a user ID
 * @param id - Unique identifier for this example
 * @param uid - User/speaker identifier
 * @param content - The example text content
 * @returns Formatted example string "ID|||Speaker: Content"
 *
 * @internal Used by assembleExampleFrom
 */
const assembleExample = (
    getSpeakerNameForExample: (uid: string) => string,
    id: string,
    uid: string,
    content: string,
) => `${id}|||${getSpeakerNameForExample(uid)}: ${content}`;

/**
 * Assemble an example string from a DataItem
 *
 * Convenience wrapper that extracts id, uid, and content from a DataItem
 * and formats them using the "|||" separator convention.
 *
 * @param dataset - Dataset containing speaker name lookup logic
 * @param item - Data item to format as an example
 * @returns Formatted example string "ID|||Speaker: Content"
 *
 * @example
 * const example = assembleExampleFrom(dataset, messageItem);
 * // Returns: "msg123|||John Doe: Hello world"
 */
export const assembleExampleFrom = <T>(dataset: Dataset<T>, item: DataItem) =>
    assembleExample(dataset.getSpeakerNameForExample, item.id, item.uid, item.content);

/** Get all items from a dataset. */
export const getAllItems = <
    TSubunit extends DataItem = DataItem,
    TUnit extends DataChunk<TSubunit> = DataChunk<TSubunit>,
>(
    dataset: Dataset<TUnit>,
): TSubunit[] =>
    Object.values(dataset.data).flatMap((chunk) =>
        Object.values(chunk).flatMap(getAllItemsFromChunk),
    );

/** Get all items from a data chunk. */
export const getAllItemsFromChunk = <TSubunit extends DataItem = DataItem>(
    chunk: DataChunk<TSubunit>,
): TSubunit[] => {
    const items: TSubunit[] = [];
    for (const item of chunk.items) {
        if ("items" in item) {
            const subchunk = item;
            // Not sure why Typescript won't infer the type here
            const subitems = getAllItemsFromChunk(subchunk);
            items.push(...subitems);
        } else {
            items.push(item);
        }
    }
    return items;
};
