import { readFileSync } from "fs";

import { GetSpeakerNameForExample } from "../constants";

import type { Codebook, DataItem } from "./schema";

// eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
export const readJSONFile = <T>(path: string) => JSON.parse(readFileSync(path, "utf-8")) as T;

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
    return AssembleExample(Item.id, Item.userID, Item.content);
}
