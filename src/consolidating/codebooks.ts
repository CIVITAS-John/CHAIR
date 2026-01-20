/**
 * Codebook Utilities Module
 *
 * This module provides utility functions for building, merging, and managing codebooks
 * during the consolidation process. It handles the transformation of raw analysis results
 * into structured codebooks with merged codes, definitions, and examples.
 *
 * Key Functionality:
 * - Building initial codebooks from thread-level analyses
 * - Merging codebooks from multiple sources (with/without reference)
 * - Cluster-based code merging with similarity tracking
 * - Code label and definition updates with merge detection
 * - Managing code ownership across multiple codebooks
 *
 * Important Concepts:
 * - alternatives: Other labels that refer to the same code (populated when codes merge)
 * - oldLabels: Temporary tracking of previous labels during a single merge operation
 * - owners: Array of codebook indices that contain this code (for multi-codebook merging)
 * - [Merged]: Special label marking codes that have been merged into another code
 *
 * Merge Strategies:
 * 1. Simple merge: Combine codes with identical labels across codebooks
 * 2. Reference merge: Use first codebook as reference, map alternatives to canonical labels
 * 3. Cluster merge: Group similar codes by embeddings, merge within clusters
 *
 * @module consolidating/codebooks
 */

import { loopThroughChunk } from "../analyzer.js";
import type { Code, Codebook, CodedThreads, CodedThreadsWithCodebook, DataChunk, DataItem, Dataset } from "../schema.js";
import type { ClusterItem } from "../utils/ai/embeddings.js";
import { requestLLM } from "../utils/ai/llms.js";
import { logger } from "../utils/core/logger.js";

import { CodebookConsolidator } from "./consolidator.js";
import { assembleExampleFrom, getAllItems } from "../utils/core/misc.js";

/**
 * Build the list of codes from raw analyses
 *
 * Collects codes from item-level analysis results and aggregates them at the thread level.
 * For each thread, this creates a codes map where each code includes all examples from
 * items that were tagged with that code.
 *
 * Process:
 * 1. Skip threads that already have codes aggregated
 * 2. Iterate through all items in each thread
 * 3. For each code on an item, add the item's content as an example
 * 4. Assemble examples with full context using assembleExampleFrom
 *
 * @template T - Type of data items
 * @param dataset - Dataset containing all items for context assembly
 * @param analyses - Thread analyses with item-level codes to aggregate
 * @returns Updated analyses with thread-level code maps populated
 */
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

/**
 * Merge thread-level codebooks into a single codebook
 *
 * Takes analyses with thread-level codes and creates a unified codebook by
 * combining codes with the same label across all threads. This is a simple
 * label-based merge without any semantic analysis.
 *
 * Merging Logic:
 * - Codes with identical labels are combined
 * - Examples, definitions, and categories are deduplicated and merged
 * - First occurrence of label establishes the canonical label
 *
 * @param analyses - Thread analyses with codes to merge
 * @returns Analyses with populated codebook field
 */
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
            // Merge arrays, removing duplicates with Set
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

/**
 * Merge multiple codebooks using label-based or reference-based strategy
 *
 * This function handles two distinct merging strategies:
 *
 * 1. Simple Merge (withReference=false):
 *    - Codes with identical labels are combined
 *    - All arrays (examples, definitions, categories) are merged and deduplicated
 *    - No ownership tracking
 *
 * 2. Reference Merge (withReference=true):
 *    - First codebook is the reference with canonical labels
 *    - Reference codebook's alternatives map is used to resolve labels
 *    - Subsequent codebooks' codes are mapped to canonical labels via alternatives
 *    - Ownership tracking: each code records which codebook indices it came from
 *    - Only reference codebook's alternatives are preserved in output
 *
 * Ownership Tracking (Reference Mode):
 * - owners array on each code lists codebook indices (0-based)
 * - Helps identify which codes appear in multiple codebooks
 * - Used for inter-rater reliability and consensus analysis
 *
 * Alternative Label Handling:
 * - alternatives field contains other labels that map to this code
 * - In reference mode, only reference codebook's alternatives are kept
 * - Other codebooks' labels become alternatives if they differ from canonical
 *
 * @param codebooks - Array of codebooks to merge (first is reference if withReference=true)
 * @param withReference - Whether to use first codebook as canonical reference
 * @returns Merged codebook with deduplicated codes
 */
export const mergeCodebooks = (codebooks: Codebook[], withReference = false): Codebook => {
    const codes = new Map<string, Code>();
    const alternatives = new Map<string, string>();

    // Initialize owners arrays for all codes
    for (const codebook of codebooks) {
        for (const code of Object.values(codebook)) {
            code.owners = [];
        }
    }

    // Process each codebook and merge codes according to strategy
    for (const [idx, codebook] of codebooks.entries()) {
        for (const [label, code] of Object.entries(codebook)) {
            // Skip codes without examples or already merged codes
            if (!code.examples?.length || code.label === "[Merged]") {
                continue;
            }

            let newLabel = label;

            if (withReference) {
                // Reference-based merging strategy
                if (idx === 0) {
                    // Reference codebook: build alternatives map
                    // Maps each alternative label to its canonical label
                    code.alternatives?.forEach((alt) => alternatives.set(alt, label));
                } else {
                    // Subsequent codebooks: map to canonical label if it's an alternative
                    if (alternatives.has(label)) {
                        newLabel = alternatives.get(label) ?? label;
                    }
                }

                // Add or update code in merged codebook
                if (!codes.has(newLabel)) {
                    // First occurrence: create clean copy
                    const newCode: Code = {
                        label: newLabel,
                        examples: code.examples,
                        definitions: code.definitions,
                        categories: code.categories,
                    };
                    // Only preserve alternatives from reference codebook
                    if (idx === 0) {
                        newCode.alternatives = code.alternatives;
                    }
                    newCode.owners = [idx];
                    codes.set(newLabel, newCode);
                } else {
                    // Code already exists: add to ownership tracking
                    const existingCode = codes.get(newLabel);
                    if (!existingCode?.owners?.includes(idx)) {
                        existingCode?.owners?.push(idx);
                    }
                }
            } else {
                // Simple label-based merging
                if (!codes.has(newLabel)) {
                    codes.set(newLabel, code);
                } else {
                    // Merge with existing code
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

/**
 * Consolidate codebook using a CodebookConsolidator
 *
 * This is the main entry point for running a consolidation pipeline on analyzed threads.
 * It validates inputs, prepares the initial codebook, and executes the consolidator
 * using chunked processing with LLM calls.
 *
 * Process:
 * 1. Validate that analyses match source count
 * 2. Build unified codebook if not already present
 * 3. Filter codes to those with examples
 * 4. Process codes in chunks via loopThroughChunk
 * 5. For each chunk: build prompts, call LLM, parse response
 * 6. Call onIterate callback after each iteration
 *
 * Temperature Adjustment:
 * - Base temperature from consolidator
 * - Increases by 0.2 per retry (up to 3 retries)
 * - Helps get different responses when retrying failed chunks
 *
 * @template TUnit - Type of source data units
 * @param consolidator - The consolidator to execute
 * @param sources - Source data units (for context)
 * @param _analyses - Thread analyses with codes to consolidate
 * @param onIterate - Optional callback after each iteration
 * @param fakeRequest - If true, simulate LLM calls without actually making them
 * @param retries - Number of retry attempts for failed chunks
 * @throws CodebookConsolidator.ConfigError if analysis doesn't match sources
 */
export const consolidateCodebook = <TUnit>(
    consolidator: CodebookConsolidator<TUnit>,
    sources: TUnit[],
    _analyses: CodedThreads,
    onIterate?: (iteration: number) => Promise<void>,
    fakeRequest = false,
    retries?: number,
) =>
    logger.withDefaultSource("consolidateCodebook", async () => {
        // Validate analysis matches source data
        if (Object.keys(_analyses.threads).length !== sources.length) {
            throw new CodebookConsolidator.ConfigError(
                `Invalid analysis: expected ${sources.length} threads, got ${Object.keys(_analyses.threads).length}`,
            );
        }

        // Ensure codebook exists by merging thread codes if necessary
        const analyses: CodedThreadsWithCodebook = _analyses.codebook
            ? (_analyses as CodedThreadsWithCodebook)
            : mergeCodebook(_analyses);

        // Only process codes that have examples
        const codes = Object.values(analyses.codebook).filter((c) => c.examples?.length);

        // Execute consolidator using chunked processing
        await loopThroughChunk(
            consolidator,
            analyses,
            sources,
            codes,
            async (currents, contexts, chunkStart, _isFirst, tries, iteration, aiParams) => {
                // Build prompts for current chunk
                const prompts = await consolidator.buildPrompts(
                    analyses,
                    sources,
                    currents,
                    contexts,
                    chunkStart,
                    iteration,
                );
                // Empty prompts signal to skip LLM processing
                if (prompts[0] === "" && prompts[1] === "") {
                    return 0;
                }

                // Call LLM with temperature adjustment for retries
                const response = await requestLLM(
                    [
                        { role: "system", content: prompts[0] },
                        { role: "user", content: prompts[1] },
                    ],
                    `codebooks/${consolidator.name}`,
                    Math.min(tries, 3) * 0.2 + consolidator.baseTemperature,
                    aiParams?.fakeRequest ?? false,
                );
                if (response === "") {
                    return 0;
                }

                // Parse LLM response and update codes
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
            { retries, fakeRequest },
        );
    });

/**
 * Merge two codes together
 *
 * This is the core code merging function that combines a source code into a parent code.
 * The source code is marked as "[Merged]" to indicate it should be removed later.
 *
 * Merging Process:
 * 1. Add source label to parent's alternatives (if not already canonical)
 * 2. Merge all array fields (definitions, categories, examples)
 * 3. Deduplicate using Set
 * 4. Merge ownership information if present
 * 5. Mark source code as "[Merged]" and clear its alternatives
 *
 * Important Distinction - alternatives vs oldLabels:
 * - alternatives: Permanent record of all labels that map to this code
 *   - Persists in final codebook
 *   - Used for lookup and reference merging
 *   - Includes labels from all merged codes
 * - oldLabels: Temporary tracking during a single merge operation
 *   - Only exists during consolidation processing
 *   - Removed in postprocess step
 *   - Used by RefineMerger to show which labels were just combined
 *
 * Example:
 * Parent: {label: "happy", alternatives: ["joyful"]}
 * Code: {label: "pleased", alternatives: ["satisfied"]}
 * Result: Parent becomes {label: "happy", alternatives: ["joyful", "pleased", "satisfied"]}
 *         Code becomes {label: "[Merged]", alternatives: []}
 *
 * @param parent - Code to merge into (modified in-place)
 * @param code - Code to merge from (will be marked "[Merged]")
 * @returns The updated parent code
 */
export const mergeCodes = (parent: Code, code: Code) => {
    // Build combined alternatives set
    const alternatives = new Set([
        ...(parent.alternatives ?? []),
        ...(code.alternatives ?? []),
        code.label,  // Add source label as alternative
    ]);
    // Remove parent label if it somehow got added
    alternatives.delete(parent.label);

    parent.alternatives = Array.from(alternatives);

    // Merge array fields with deduplication
    for (const prop of ["definitions", "categories", "examples"] as const) {
        parent[prop] = Array.from(new Set((parent[prop] ?? []).concat(code[prop] ?? [])));
    }

    // Merge ownership if either code has ownership tracking
    if (parent.owners || code.owners) {
        parent.owners = Array.from(new Set((parent.owners ?? []).concat(code.owners ?? [])));
    }

    // Mark source code as merged and clear its alternatives
    code.label = "[Merged]";
    code.alternatives = [];
    return parent;
};

/**
 * Merge codes based on clustering results
 *
 * Takes codes that have been grouped into clusters by similarity and merges codes
 * within each cluster into a single representative code.
 *
 * Cluster Selection Strategy:
 * - For each cluster, select the "best" code to be the merge target
 * - Best code is determined by:
 *   1. Highest clustering probability (most central to cluster)
 *   2. Shortest combined label + definition length (tie-breaker)
 *   3. Label length weighted 5x more than definition length
 *
 * Special Cluster IDs:
 * - -1: Unclustered codes (outliers that don't fit any cluster)
 *   - These codes are kept separate and not merged
 * - 0, 1, 2, ...: Regular clusters that will be merged
 *
 * oldLabels Tracking:
 * - The best code in each cluster gets oldLabels array initialized
 * - When merging, source code labels are added to oldLabels
 * - This provides temporary tracking of what was just merged
 * - Used by RefineMerger to show LLM which concepts to combine
 * - Different from alternatives (permanent) vs oldLabels (temporary)
 *
 * Probability Logging:
 * - Each merge logs the clustering probability
 * - High probability = codes very similar
 * - Low probability = codes on edge of cluster, may need review
 *
 * @param clusters - Map of cluster ID to items with probabilities
 * @param codes - Array of all codes to process
 * @returns Codebook with merged codes
 */
export const mergeCodesByCluster = (clusters: Record<number, ClusterItem[]>, codes: Code[]) =>
    logger.withDefaultSource("mergeCodesByCluster", () => {
        const codebook: Record<string, Code> = {};

        // Clean up temporary oldLabels from any previous operations
        codes.forEach((code) => delete code.oldLabels);

        // Process each cluster
        for (const key of Object.keys(clusters)) {
            const clusterID = parseInt(key);

            // Select best code to merge into
            // Sort by probability descending, then by label+definition length ascending
            const bestCodes = clusters[clusterID]
                .sort((A, B) => B.probability - A.probability)
                .map((item) => codes[item.id])
                .filter((code) => code.label !== "[Merged]")
                .sort(
                    (A, B) =>
                        // Label weighted 5x more than definition length
                        A.label.length * 5 +
                        (A.definitions?.[0]?.length ?? 0) -
                        (B.label.length * 5 + (B.definitions?.[0]?.length ?? 0)),
                );

            if (bestCodes.length === 0) continue;
            const bestCode = bestCodes[0];

            // Initialize oldLabels for clustered codes (not for outliers)
            if (clusterID !== -1) {
                codebook[bestCode.label] = bestCode;
                bestCode.oldLabels = bestCode.oldLabels ?? [];
            }

            // Merge all codes in cluster into best code
            for (const item of clusters[clusterID]) {
                const code = codes[item.id];
                if (code.label === "[Merged]") continue;

                if (clusterID === -1) {
                    // Outlier codes: keep separate, don't merge
                    codebook[code.label] = code;
                } else if (code.label !== bestCode.label) {
                    // Merge into best code
                    logger.info(
                        `Merging ${code.label} into ${bestCode.label} with ${(item.probability * 100).toFixed(2)}% certainty`,
                    );
                    // Track in oldLabels for this consolidation operation
                    if (!bestCode.oldLabels?.includes(code.label)) {
                        bestCode.oldLabels?.push(code.label);
                    }
                    mergeCodes(bestCode, code);
                } else {
                    // Best code itself: already added to codebook above
                    codebook[code.label] = code;
                }
            }
        }
        logger.success(`Merged ${codes.length} codes into ${Object.keys(codebook).length}`);
        return codebook;
    });

/**
 * Update code labels and definitions from LLM-generated new codes
 *
 * This function handles the complex logic of applying LLM updates to codes, including:
 * - Updating definitions and categories
 * - Detecting label changes and merging codes accordingly
 * - Managing alternatives when labels change
 *
 * Label Change Detection and Merging:
 * - If new label matches existing code, merge into that code
 * - Checks both exact label matches and alternative label matches
 * - When merging, source code is marked "[Merged]"
 *
 * Alternative Management:
 * - Old label becomes an alternative when label changes
 * - New label removed from alternatives if it was previously there
 * - Prevents circular references in alternatives
 *
 * Array Position Matching:
 * - newCodes[i] corresponds to codes[i]
 * - Skips codes marked "[Merged]" or with "[Merged]" in newCodes
 * - Breaks early if newCodes has fewer entries than codes
 *
 * @param codebook - Full codebook for looking up existing codes
 * @param newCodes - LLM-generated updated codes (same order as codes parameter)
 * @param codes - Original codes being updated
 * @returns Updated codebook
 */
export const updateCodes = (codebook: Codebook, newCodes: Code[], codes: Code[]) => {
    const allCodes = Object.values(codebook);

    for (let i = 0; i < codes.length; i++) {
        const newCode = newCodes[i];
        // Break if LLM didn't provide enough codes
        if (typeof newCode !== "object") break;
        // Skip codes that are already merged
        if (codes[i].label === "[Merged]" || newCode.label === "[Merged]") continue;

        const newLabel = newCode.label.toLowerCase();

        // Always update definitions and categories from LLM
        codes[i].definitions = newCode.definitions;
        codes[i].categories = newCode.categories;

        // Handle label changes
        if (newLabel !== codes[i].label) {
            // Look for existing code with this label
            let parent = allCodes.find((cur) => cur.label === newLabel);
            // Also check alternatives in case new label is a known alternative
            parent ??= allCodes.find((cur) => cur.alternatives?.includes(newLabel));

            if (parent && parent !== codes[i]) {
                // New label matches existing code: merge into that code
                logger.info(
                    `Merging ${codes[i].label} into ${parent.label} due to updated label "${newLabel}"`,
                );
                mergeCodes(parent, codes[i]);
                continue;
            }

            // New label doesn't match any existing code: update label and alternatives
            let alternatives = codes[i].alternatives ?? [];

            // Add old label to alternatives if not already there
            if (!alternatives.includes(codes[i].label)) {
                alternatives.push(codes[i].label);
            }

            // Remove new label from alternatives if it was there
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
