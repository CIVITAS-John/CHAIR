import type { Codebook, DataItem } from "../schema";

/** Reverse a string. */
export const reverse = (s: string) => s.split("").reverse().join("");

/** Wait for a number of milliseconds. */
export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Create a promise with timeout. */
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
        throw new Error(`Invalid datetime: ${datetime}`);
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

/** GetCategories: Get the categories from the codebook. */
export function GetCategories(Codebook: Codebook): Map<string, string[]> {
    const Categories = new Map<string, string[]>();
    for (const Code of Object.values(Codebook)) {
        for (const Category of Code.categories ?? []) {
            if (Category === "") {
                continue;
            }
            if (!Categories.has(Category)) {
                Categories.set(Category, []);
            }
            if (!Categories.get(Category)!.includes(Code.label)) {
                Categories.get(Category)!.push(Code.label);
            }
        }
    }
    return Categories;
}

/** AssembleExample: Assemble an example. */
export const assembleExample = (
    getSpeakerNameForExample: (uid: string) => string,
    id: string,
    uid: string,
    content: string,
) => {
    return `${id}|||${getSpeakerNameForExample(uid)}: ${content}`;
};

/** AssembleExampleFrom: Assemble an example from a data item. */
export function assembleExampleFrom(
    getSpeakerNameForExample: (uid: string) => string,
    item: DataItem,
) {
    return assembleExample(getSpeakerNameForExample, item.id, item.uid, item.content);
}
