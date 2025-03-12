import { readFileSync } from "fs";
import { resolve } from "path";

import { GetSpeakerNameForExample } from "../constants";

import type { Codebook, DataItem } from "./schema";

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

/** GetCategories: Get the categories from the codebook. */
export function GetCategories(Codebook: Codebook): Map<string, string[]> {
    const Categories = new Map<string, string[]>();
    for (const Code of Object.values(Codebook)) {
        for (const Category of Code.Categories ?? []) {
            if (Category === "") {
                continue;
            }
            if (!Categories.has(Category)) {
                Categories.set(Category, []);
            }
            if (!Categories.get(Category)!.includes(Code.Label)) {
                Categories.get(Category)!.push(Code.Label);
            }
        }
    }
    return Categories;
}

/** AssembleExample: Assemble an example. */
export function AssembleExample(ID: string, UserID: string, Content: string) {
    return `${ID}|||${GetSpeakerNameForExample(UserID)}: ${Content}`;
}

/** AssembleExampleFrom: Assemble an example from a data item. */
export function AssembleExampleFrom(Item: DataItem) {
    return AssembleExample(Item.id, Item.uid, Item.content);
}
