import { mkdirSync, readFileSync } from "fs";
import { join, resolve } from "path";

import type { Codebook, DataItem } from "../schema";

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export const readJSONFile = <T>(path: string) => JSON.parse(readFileSync(path, "utf-8")) as T;

export const importDefault = async (path: string) => {
    const module = (await import(`file://${resolve(path)}`)) as unknown;
    if (typeof module !== "object" || module === null) {
        throw new TypeError(`${path} is not a valid module`);
    }
    if (!("default" in module)) {
        throw new TypeError(`Module ${path} does not have a default export`);
    }
    return module.default;
};

/** Ensure that a folder exists. */
export const ensureFolder = (path: string) => {
    mkdirSync(path, { recursive: true });
    return path;
};

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

export const getMessagesPath = (datasetPath: string, name: string) => join(datasetPath, name);

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
