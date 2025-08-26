import { HumanMessage, SystemMessage } from "@langchain/core/messages";

import { loopThroughChunk } from "../analyzer.js";
import type { Code, Codebook, CodedThreads, CodedThreadsWithCodebook, DataChunk, DataItem, Dataset } from "../schema.js";
import type { ClusterItem } from "../utils/embeddings.js";
import { requestLLM } from "../utils/llms.js";
import { logger } from "../utils/logger.js";

import { CodebookConsolidator } from "./consolidator.js";
import { assembleExampleFrom, getAllItems } from "../utils/misc.js";

/** Build the list of codes from raw analyses. */
export const buildCodes = <T>(dataset: Dataset<DataChunk<DataItem>>, analyses: CodedThreads): CodedThreads => {
    const allItems = getAllItems(dataset);
    for (const analysis of Object.values(analyses.threads)) {
        if (analysis.codes) continue;
        analysis.codes = {};
        for (const item of Object.values(analysis.items)) {
            if (!item.codes) continue;
            for (const code of item.codes) {
                const current: Code = analysis.codes[code] ?? { label: code, examples: [] };
                analysis.codes[code] = current;
                // find the message
                const message = allItems.find((pending) => item.id === pending.id);
                if (!message) {
                    logger.warn(`Message ${item.id} not found in chunk ${analysis.id}`);
                    continue;
                }
                // assemble the message
                const contentWithID = assembleExampleFrom(dataset, message);
                if (message.content !== "" && !current.examples?.includes(contentWithID)) {
                    current.examples?.push(contentWithID);
                }
            }
        }
    }
    return analyses;
}

/** Simply merge the codebooks without further consolidating. */
export const mergeCodebook = (analyses: CodedThreads): CodedThreadsWithCodebook => {
    analyses.codebook = {};
    for (const analysis of Object.values(analyses.threads)) {
        for (const [code, value] of Object.entries(analysis.codes)) {
            const cur = analyses.codebook[code] ?? {
                label: value.label,
                examples: [],
                definitions: [],
                categories: [],
            };
            if (value.examples?.length) {
                cur.examples = [...new Set([...(cur.examples ?? []), ...value.examples])];
            }
            if (value.definitions?.length) {
                cur.definitions = [...new Set([...(cur.definitions ?? []), ...value.definitions])];
            }
            if (value.categories?.length) {
                cur.categories = [...new Set([...(cur.categories ?? []), ...value.categories])];
            }
            analyses.codebook[code] = cur;
        }
    }
    return analyses as CodedThreadsWithCodebook;
};

/** Merge multiple codebooks simply by labels of codes. */
export const mergeCodebooks = (codebooks: Codebook[], withReference = false): Codebook => {
    const codes = new Map<string, Code>();
    const alternatives = new Map<string, string>();
    for (const codebook of codebooks) {
        for (const code of Object.values(codebook)) {
            code.owners = [];
        }
    }
    // Then, we combine the codes from each codebook and record the ownership
    // We use the reference code as the baseline if multiple codes are found
    // Here, the reference codebook's first definition will be used (will need to change)
    for (const [idx, codebook] of codebooks.entries()) {
        for (const [label, code] of Object.entries(codebook)) {
            // We don't accept anything without an example.
            if (!code.examples?.length || code.label === "[Merged]") {
                continue;
            }
            let newLabel = label;
            if (withReference) {
                // Merge the alternatives
                if (idx === 0) {
                    code.alternatives?.forEach((alt) => alternatives.set(alt, label));
                } else {
                    if (alternatives.has(label)) {
                        newLabel = alternatives.get(label) ?? label;
                    }
                }
                // Merge the code
                if (!codes.has(newLabel)) {
                    // Here we want to create a clean copy
                    const newCode: Code = {
                        label: newLabel,
                        examples: code.examples,
                        definitions: code.definitions,
                        categories: code.categories,
                    };
                    // We only care about the reference codebook's alternatives
                    if (idx === 0) {
                        newCode.alternatives = code.alternatives;
                    }
                    newCode.owners = [idx];
                    codes.set(newLabel, newCode);
                } else {
                    const code = codes.get(newLabel);
                    if (!code?.owners?.includes(idx)) {
                        code?.owners?.push(idx);
                    }
                }
            } else {
                // Merge the code
                if (!codes.has(newLabel)) {
                    codes.set(newLabel, code);
                } else {
                    mergeCodes(codes.get(newLabel) ?? ({} as Code), code);
                }
            }
        }
    }
    return Object.fromEntries(codes);
};

// /** ConsolidateChunks: Load, consolidate, and export codebooks. */
// export async function ConsolidateChunks<T extends DataItem>(
//     Consolidator: CodebookConsolidator<DataChunk<T>>,
//     Group: string,
//     ConversationName: string,
//     Analyzer: string,
//     AnalyzerLLM: string,
//     FakeRequest = false,
// ) {
//     const ExportFolder = GetMessagesPath(Group, `${Analyzer}-${Consolidator.Name}`);
//     EnsureFolder(ExportFolder);
//     // Load the conversations and analyses
//     const Conversations = LoadChunksForAnalysis(Group, ConversationName);
//     const Analyses = await LoadAnalyses(
//         GetMessagesPath(
//             Group,
//             `${Analyzer}/${ConversationName.replace(".json", `-${AnalyzerLLM}`)}`,
//         ),
//     );
//     const ResultName = AnalyzerLLM === LLMName ? AnalyzerLLM : `${AnalyzerLLM}-${LLMName}`;
//     // Consolidate the codebook
//     await consolidateCodebook(
//         Consolidator,
//         [...Object.values(Conversations)],
//         Analyses,
//         async (Iteration) => {
//             const Values = Object.values(Analyses.Codebook).filter(
//                 (Code) => Code.Label !== "[Merged]",
//             );
//             Analyses.Codebook = {};
//             for (const Code of Values) {
//                 Analyses.Codebook[Code.Label] = Code;
//             }
//             const Book = ExportChunksForCoding(Object.values(Conversations), Analyses);
//             await Book.xlsx.writeFile(
//                 `${ExportFolder}/${ConversationName.replace(".json", `-${ResultName}-${Iteration}`)}.xlsx`,
//             );
//         },
//         FakeRequest,
//     );
//     // Write the result into a JSON file
//     File.writeFileSync(
//         `${ExportFolder}/${ConversationName.replace(".json", `-${ResultName}`)}.json`,
//         JSON.stringify(Analyses, null, 4),
//     );
//     // Write the result into an Excel file
//     const Book = ExportChunksForCoding(Object.values(Conversations), Analyses);
//     await Book.xlsx.writeFile(
//         `${ExportFolder}/${ConversationName.replace(".json", `-${ResultName}`)}.xlsx`,
//     );
// }

/** Load, consolidate, and export codebooks. */
export const consolidateCodebook = <TUnit>(
    consolidator: CodebookConsolidator<TUnit>,
    sources: TUnit[],
    _analyses: CodedThreads,
    onIterate?: (iteration: number) => Promise<void>,
    fakeRequest = false,
    retries?: number,
) =>
    logger.withDefaultSource("consolidateCodebook", async () => {
        // Check if the analysis is already done
        if (Object.keys(_analyses.threads).length !== sources.length) {
            throw new CodebookConsolidator.ConfigError(
                `Invalid analysis: expected ${sources.length} threads, got ${Object.keys(_analyses.threads).length}`,
            );
        }

        const analyses: CodedThreadsWithCodebook = _analyses.codebook
            ? (_analyses as CodedThreadsWithCodebook)
            : mergeCodebook(_analyses);

        // Ignore codes with 0 examples
        const codes = Object.values(analyses.codebook).filter((c) => c.examples?.length);
        // Run the coded threads through chunks (as defined by the consolidator)
        await loopThroughChunk(
            consolidator,
            analyses,
            sources,
            codes,
            async (currents, chunkStart, _isFirst, tries, iteration) => {
                const prompts = await consolidator.buildPrompts(
                    analyses,
                    sources,
                    currents,
                    chunkStart,
                    iteration,
                );
                if (prompts[0] === "" && prompts[1] === "") {
                    return 0;
                }
                // Run the prompts
                const response = await requestLLM(
                    [new SystemMessage(prompts[0]), new HumanMessage(prompts[1])],
                    `codebooks/${consolidator.name}`,
                    Math.min(tries, 3) * 0.2 + consolidator.baseTemperature,
                    fakeRequest,
                );
                if (response === "") {
                    return 0;
                }
                // Parse the response
                const res = await consolidator.parseResponse(
                    analyses,
                    response.split("\n").map((Line) => Line.trim()),
                    currents,
                    chunkStart,
                    iteration,
                );
                if (typeof res === "number") {
                    return res;
                }
                return 0;
            },
            onIterate,
            retries,
        );
    });

/** Merge labels and definitions of two codes. */
export const mergeCodes = (parent: Code, code: Code) => {
    const alternatives = new Set([
        ...(parent.alternatives ?? []),
        ...(code.alternatives ?? []),
        code.label,
    ]);
    alternatives.delete(parent.label);

    parent.alternatives = Array.from(alternatives);
    for (const prop of ["definitions", "categories", "examples"] as const) {
        parent[prop] = Array.from(new Set((parent[prop] ?? []).concat(code[prop] ?? [])));
    }
    if (parent.owners || code.owners) {
        parent.owners = Array.from(new Set((parent.owners ?? []).concat(code.owners ?? [])));
    }
    code.label = "[Merged]";
    code.alternatives = [];
    return parent;
};

/** Merge codebooks based on clustering results. */
export const mergeCodesByCluster = (clusters: Record<number, ClusterItem[]>, codes: Code[]) =>
    logger.withDefaultSource("mergeCodesByCluster", () => {
        const codebook: Record<string, Code> = {};
        // Remove temp labels
        codes.forEach((code) => delete code.oldLabels);
        // Merge the codes based on clustering results
        for (const key of Object.keys(clusters)) {
            const clusterID = parseInt(key);
            // Pick the code with the highest probability and the shortest label + definition to merge into
            // This could inevitably go wrong. We will need another iteration to get a better new label
            const bestCodes = clusters[clusterID]
                .sort((A, B) => B.probability - A.probability)
                .map((item) => codes[item.id])
                .filter((code) => code.label !== "[Merged]")
                .sort(
                    (A, B) =>
                        A.label.length * 5 +
                        (A.definitions?.[0]?.length ?? 0) -
                        (B.label.length * 5 + (B.definitions?.[0]?.length ?? 0)),
                );
            if (bestCodes.length === 0) continue;
            const bestCode = bestCodes[0];
            if (clusterID !== -1) {
                codebook[bestCode.label] = bestCode;
                bestCode.oldLabels = bestCode.oldLabels ?? [];
            }
            for (const item of clusters[clusterID]) {
                const code = codes[item.id];
                if (code.label === "[Merged]") continue;
                if (clusterID === -1) {
                    // Codes that cannot be clustered
                    codebook[code.label] = code;
                } else if (code.label !== bestCode.label) {
                    // Merge the code
                    logger.info(
                        `Merging ${code.label} into ${bestCode.label} with ${(item.probability * 100).toFixed(2)}% certainty`,
                    );
                    if (!bestCode.oldLabels?.includes(code.label)) {
                        bestCode.oldLabels?.push(code.label);
                    }
                    mergeCodes(bestCode, code);
                } else {
                    // Codes that have no name changes
                    codebook[code.label] = code;
                }
            }
        }
        logger.success(`Merged ${codes.length} codes into ${Object.keys(codebook).length}`);
        return codebook;
    });

/** Update code labels and definitions. */
export const updateCodes = (codebook: Codebook, newCodes: Code[], codes: Code[]) => {
    const allCodes = Object.values(codebook);
    for (let i = 0; i < codes.length; i++) {
        const newCode = newCodes[i];
        if (typeof newCode !== "object") break;
        if (codes[i].label === "[Merged]" || newCode.label === "[Merged]") continue;
        const newLabel = newCode.label.toLowerCase();
        // Update the code
        codes[i].definitions = newCode.definitions;
        codes[i].categories = newCode.categories;
        // Check if the label is changed
        if (newLabel !== codes[i].label) {
            // Find the code with the same new label and merge
            let parent = allCodes.find((cur) => cur.label === newLabel);
            parent ??= allCodes.find((cur) => cur.alternatives?.includes(newLabel));
            if (parent && parent !== codes[i]) {
                logger.info(
                    `Merging ${codes[i].label} into ${parent.label} due to updated label "${newLabel}"`,
                );
                mergeCodes(parent, codes[i]);
                continue;
            }
            // Otehrwise, update the label and alternatives
            let alternatives = codes[i].alternatives ?? [];
            if (!alternatives.includes(codes[i].label)) {
                alternatives.push(codes[i].label);
            }
            if (alternatives.includes(newLabel)) {
                alternatives = alternatives.filter((Alternative) => Alternative !== newLabel);
            }
            codes[i].alternatives = alternatives;
            codes[i].label = newLabel;
        }
    }
    return codebook;
};

// /** UpdateCategories: Update category mappings for codes. */
// export function UpdateCategories(Categories: string[], NewCategories: string[], Codes: Code[]) {
//     for (let I = 0; I < Categories.length; I++) {
//         const Category = Categories[I];
//         const NewCategory = NewCategories[I];
//         for (const Code of Codes) {
//             if (Code.Categories?.includes(Category)) {
//                 Code.Categories = Code.Categories.filter((C) => C !== Category);
//                 if (!Code.Categories.includes(NewCategory)) {
//                     Code.Categories.push(NewCategory);
//                 }
//             }
//         }
//     }
// }

// /** UpdateCategoriesByMap: Update category mappings for codes using a map. */
// export function UpdateCategoriesByMap(Map: Map<string, string>, Codes: Code[]) {
//     UpdateCategories([...Map.keys()], [...Map.values()], Codes);
// }

// /** AssignCategoriesByCluster: Assign categories based on category clustering results. */
// export function AssignCategoriesByCluster(
//     Clusters: Record<number, ClusterItem[]>,
//     Codes: Code[],
// ): Record<string, Code[]> {
//     const Results: Record<string, Code[]> = {};
//     for (const Key of Object.keys(Clusters)) {
//         const ClusterID = parseInt(Key);
//         const ClusterName = ClusterID === -1 ? "miscellaneous" : `cluster ${ClusterID}`;
//         const Items: Code[] = [];
//         for (const Item of Clusters[ClusterID]) {
//             Codes[Item.ID].Categories = [ClusterName];
//             Items.push(Codes[Item.ID]);
//         }
//         if (ClusterID !== -1) {
//             Results[ClusterName] = Items;
//         }
//     }
//     return Results;
// }

// /** MergeCategoriesByCluster: Merge categories based on category clustering results. */
// export function MergeCategoriesByCluster(
//     Clusters: Record<number, ClusterItem[]>,
//     Categories: string[],
//     Codes: Code[],
//     TakeFirst = false,
// ): Record<string, string[]> {
//     const Results: Record<string, string[]> = {};
//     for (const Key of Object.keys(Clusters)) {
//         const ClusterID = parseInt(Key);
//         // Skip the non-clustered ones
//         if (ClusterID === -1) {
//             continue;
//         }
//         // Get the current categories
//         const Subcategories = Clusters[ClusterID].map((Item) => Categories[Item.ID]);
//         if (Subcategories.length <= 1) {
//             continue;
//         }
//         // Merge the categories
//         const NewCategory = TakeFirst ? Subcategories[0] : Subcategories.join("|");
//         console.log(
//             `Merging categories: ${Clusters[ClusterID].map(
//                 (Item) => `${Categories[Item.ID]} with ${(Item.Probability * 100).toFixed(2)}%`,
//             ).join(", ")}`,
//         );
//         for (const Code of Codes) {
//             if (!Code.Categories) {
//                 continue;
//             }
//             const Filtered = Code.Categories.filter(
//                 (Category) => !Subcategories.includes(Category),
//             );
//             if (Filtered.length !== Code.Categories.length) {
//                 Code.Categories = Array.from(
//                     new Set([
//                         ...Code.Categories.filter((Category) => !Subcategories.includes(Category)),
//                         NewCategory,
//                     ]),
//                 );
//             }
//         }
//         // Record the new category
//         Results[NewCategory] = Subcategories;
//     }
//     return Results;
// }
