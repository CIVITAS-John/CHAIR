/**
 * Intercoder Reliability Metrics Module
 *
 * This module provides utilities for calculating intercoder reliability metrics
 * when comparing qualitative coding across multiple coders (human and AI).
 *
 * Key Features:
 * - Handles multiple codes per item (set-based comparison)
 * - Jaccard distance for item-level differences
 * - Krippendorff's Alpha for overall reliability
 * - Pairwise coder comparisons
 * - Per-code precision/recall metrics
 *
 * Metrics Supported:
 * - Jaccard Distance: 1 - (intersection / union) for code sets
 * - Percent Agreement: Simple agreement percentage
 * - Krippendorff's Alpha: Robust reliability metric for multiple coders
 * - Code-level Precision/Recall: Per-code accuracy metrics
 */

import { alpha } from "krippendorff";

import type {
    CodeLevelMetrics,
    DifferenceCalculator,
    ItemComparison,
    PairwiseReliability,
} from "./reliability-interfaces.js";
import type { Code, Codebook, CodedItem, CodedThread, DataChunk, DataItem } from "../schema.js";
import { getAllItemsFromChunk } from "../utils/core/misc.js";
import { createRollingWindow } from "../utils/rolling-window.js";

export type {
    CodeLevelMetrics,
    DifferenceCalculator,
    ItemComparison,
    PairwiseReliability,
} from "./reliability-interfaces.js";

/**
 * Binary matrix distance calculator for code sets.
 *
 * Treats all codes in the codebook as a fixed-dimension binary matrix where:
 * - Each code is a dimension (column)
 * - 1 = code present, 0 = code absent
 * - Distance = Hamming distance / number of codes (normalized to 0-1)
 *
 * This approach considers both presence and absence of codes as meaningful,
 * making it ideal for deductive coding with fixed codebooks.
 *
 * @param codes1 - First coder's codes
 * @param codes2 - Second coder's codes
 * @param codebook - The full codebook defining all possible codes
 * @returns Normalized Hamming distance (0 = identical, 1 = completely different)
 */
export const defaultCalculateDifference: DifferenceCalculator = (
    codes1: string[],
    codes2: string[],
    codebook: Codebook,
): number => {
    // Get all codes from the codebook
    const allCodes = Object.keys(codebook);

    // Handle edge case: empty codebook
    if (allCodes.length === 0) return 0;

    // Create sets for efficient lookup
    const set1 = new Set(codes1);
    const set2 = new Set(codes2);

    // Calculate Hamming distance (count of different bits)
    let hammingDistance = 0;
    for (const code of allCodes) {
        const in1 = set1.has(code);
        const in2 = set2.has(code);
        if (in1 !== in2) {
            hammingDistance++;
        }
    }

    // Normalize by total number of codes to get 0-1 range
    return hammingDistance / allCodes.length;
};

/**
 * Extract all coded items from a set of coded threads.
 *
 * @param threads - Record of coded threads
 * @returns Array of all coded items across all threads
 */
export const extractCodedItems = (threads: Record<string, CodedThread>): CodedItem[] =>
    Object.values(threads).flatMap((thread) => Object.values(thread.items));

/**
 * Extract thread-level coded items by aggregating all codes within each thread.
 *
 * For each thread, applies skipItem filtering, then creates a single CodedItem with:
 * - id = thread ID
 * - codes = deduplicated union of all codes from non-skipped items in the thread
 *
 * Threads where all items are filtered out are omitted entirely.
 *
 * Used when rollingWindow === -1 for thread-level reliability calculation.
 *
 * @param threads - Record of coded threads
 * @param skipItem - Optional function to skip certain items during aggregation
 * @param dataItems - Map of item IDs to original data items for filtering
 * @returns Array of thread-level coded items (one per thread)
 */
export const extractCodedItemsByThread = (
    threads: Record<string, CodedThread>,
    skipItem?: (item: DataItem) => boolean,
    dataItems?: Map<string, DataItem>,
): CodedItem[] => {
    const result: CodedItem[] = [];
    for (const thread of Object.values(threads)) {
        const allCodes = new Set<string>();
        for (const item of Object.values(thread.items)) {
            // Apply skipItem filter before aggregation
            if (skipItem && dataItems) {
                const dataItem = dataItems.get(item.id);
                if (dataItem && skipItem(dataItem)) continue;
            }
            if (item.codes) {
                for (const code of item.codes) {
                    allCodes.add(code);
                }
            }
        }
        // Skip entire thread if all items were filtered out
        if (allCodes.size > 0) {
            result.push({ id: thread.id, codes: [...allCodes] });
        }
    }
    return result;
};

/**
 * Extract chunk-level coded items by pooling all codes in each dataset chunk.
 *
 * Each returned CodedItem uses the chunk ID as its ID and contains the
 * deduplicated union of all non-skipped item codes in that chunk. Chunks with
 * no remaining source items after filtering are omitted; chunks with source
 * items but no codes are retained as empty-code agreements.
 *
 * @param threads - Record of coded threads from one coder
 * @param chunks - Dataset chunks to aggregate over
 * @param skipItem - Optional function to skip source data items
 * @returns Array of chunk-level coded items (one per included chunk)
 */
export const extractCodedItemsByChunk = <TSubunit extends DataItem>(
    threads: Record<string, CodedThread>,
    chunks: DataChunk<TSubunit>[],
    skipItem?: (item: DataItem) => boolean,
): CodedItem[] => {
    const codedItemsById = new Map<string, CodedItem>();
    for (const thread of Object.values(threads)) {
        for (const item of Object.values(thread.items)) {
            codedItemsById.set(item.id, item);
        }
    }

    return chunks.flatMap((chunk) => {
        const sourceItems = getAllItemsFromChunk(chunk).filter((item) => !skipItem?.(item));
        if (sourceItems.length === 0) return [];

        const codes = new Set<string>();
        const thread = threads[chunk.id];
        for (const sourceItem of sourceItems) {
            const codedItem = thread?.items[sourceItem.id] ?? codedItemsById.get(sourceItem.id);
            for (const code of codedItem?.codes ?? []) {
                codes.add(code);
            }
        }

        return [{ id: chunk.id, codes: [...codes] }];
    });
};

/**
 * Compare two coders on a set of items using a difference calculator.
 *
 * @param items1 - Coded items from first coder
 * @param items2 - Coded items from second coder
 * @param codebook - The full codebook defining all possible codes
 * @param calculateDifference - Function to calculate item-level difference
 * @param skipItem - Optional function to skip certain items
 * @param dataItems - Map of item IDs to original data items for filtering
 * @param rollingWindow - Optional window size for aggregate comparison (benefit-only)
 * @param skipCodes - Optional function to skip certain codes during comparison
 * @returns Array of item comparisons
 */
export const compareItems = (
    items1: CodedItem[],
    items2: CodedItem[],
    codebook: Codebook,
    calculateDifference: DifferenceCalculator = defaultCalculateDifference,
    skipItem?: (item: DataItem) => boolean,
    dataItems?: Map<string, DataItem>,
    rollingWindow?: number,
    skipCodes?: (label: string, code: Code | undefined) => boolean,
    chunks?: DataChunk<DataItem>[],
): ItemComparison[] => {
    // Create lookup maps for both coders' items
    const items1Map = new Map(items1.map((item) => [item.id, item]));
    const items2Map = new Map(items2.map((item) => [item.id, item]));

    // Collect all unique item IDs from both coders
    const allItemIds = new Set([
        ...items1.map((item) => item.id),
        ...items2.map((item) => item.id),
    ]);

    // First pass: collect all items that pass the filter
    const filteredPairs: Array<{ item1: CodedItem; item2: CodedItem }> = [];

    for (const itemId of allItemIds) {
        // Skip if filter function returns true
        if (skipItem && dataItems) {
            const dataItem = dataItems.get(itemId);
            if (dataItem && skipItem(dataItem)) continue;
        }

        // Get items from both coders, creating empty coded items if missing
        const item1 = items1Map.get(itemId) || { id: itemId, codes: [] };
        const item2 = items2Map.get(itemId) || { id: itemId, codes: [] };

        // Include all items that pass the filter (including those where both coders applied no codes)
        // Agreement on "no codes" is still a valid form of agreement
        filteredPairs.push({ item1, item2 });
    }

    // Helper function to filter codes if skipCodes is provided
    const filterCodes = (codes: string[]): string[] => {
        if (!skipCodes) return codes;
        return codes.filter((label) => {
            const code = codebook?.[label];
            return !skipCodes(label, code);
        });
    };

    // If no rolling window, use standard item-by-item comparison
    if (!rollingWindow || rollingWindow <= 0) {
        return filteredPairs.map(({ item1, item2 }) => {
            const codes1 = item1.codes ?? [];
            const codes2 = item2.codes ?? [];

            // Filter codes if skipCodes function is provided
            const filteredCodes1 = filterCodes(codes1);
            const filteredCodes2 = filterCodes(codes2);

            const difference = calculateDifference(filteredCodes1, filteredCodes2, codebook);

            return {
                itemId: item1.id,
                codes1: codes1, // Original codes
                codes2: codes2, // Original codes
                adjustedCodes1: filteredCodes1, // Adjusted codes (filtered, no window)
                adjustedCodes2: filteredCodes2, // Adjusted codes (filtered, no window)
                difference,
            };
        });
    }

    // Rolling window comparison (benefit-only) using RollingWindowAggregator
    const comparisons: ItemComparison[] = [];

    // Use the rolling window aggregator to collect codes in windows
    const windowAggregator = createRollingWindow<CodedItem>(rollingWindow);

    // Extract items for each coder from filtered pairs
    const filteredItems1 = filteredPairs.map((p) => p.item1);
    const filteredItems2 = filteredPairs.map((p) => p.item2);

    // Aggregate codes within windows for each coder, respecting chunk boundaries
    const getId = (item: CodedItem) => item.id;
    const getCodes = (item: CodedItem) => filterCodes(item.codes ?? []);

    const windowMap1 = new Map<string, Set<string>>();
    const windowMap2 = new Map<string, Set<string>>();

    if (chunks && chunks.length > 0) {
        // Build item-to-chunk mapping
        const itemToChunkId = new Map<string, string>();
        for (const chunk of chunks) {
            for (const sourceItem of getAllItemsFromChunk(chunk)) {
                itemToChunkId.set(sourceItem.id, chunk.id);
            }
        }

        // Group items by chunk and aggregate per-chunk
        const grouped1 = Map.groupBy(filteredItems1, (item) => itemToChunkId.get(item.id) ?? "");
        const grouped2 = Map.groupBy(filteredItems2, (item) => itemToChunkId.get(item.id) ?? "");

        for (const [, chunkItems] of grouped1) {
            for (const [id, codes] of windowAggregator.aggregate(chunkItems, getId, getCodes)) {
                windowMap1.set(id, codes);
            }
        }
        for (const [, chunkItems] of grouped2) {
            for (const [id, codes] of windowAggregator.aggregate(chunkItems, getId, getCodes)) {
                windowMap2.set(id, codes);
            }
        }
    } else {
        // No chunk info: original cross-boundary behavior
        for (const [id, codes] of windowAggregator.aggregate(filteredItems1, getId, getCodes)) {
            windowMap1.set(id, codes);
        }
        for (const [id, codes] of windowAggregator.aggregate(filteredItems2, getId, getCodes)) {
            windowMap2.set(id, codes);
        }
    }

    for (let i = 0; i < filteredPairs.length; i++) {
        const { item1, item2 } = filteredPairs[i];

        // Get base codes for this item
        const baseCodes1 = item1.codes ?? [];
        const baseCodes2 = item2.codes ?? [];

        // Filter base codes if skipCodes function is provided
        const filteredBaseCodes1 = filterCodes(baseCodes1);
        const filteredBaseCodes2 = filterCodes(baseCodes2);

        // Get aggregated codes from windows
        const windowCodes1Set = windowMap1.get(item1.id)!;
        const windowCodes2Set = windowMap2.get(item2.id)!;

        // Apply benefit-only logic:
        // - Start with filtered base codes at exact position
        // - Give each coder benefit for window codes that the OTHER coder explicitly has at this item
        const benefitCodes1 = new Set(filteredBaseCodes1);
        const benefitCodes2 = new Set(filteredBaseCodes2);

        // Give coder 1 benefit for codes in their window that coder 2 explicitly has at this item
        for (const code of filteredBaseCodes2) {
            if (windowCodes1Set.has(code)) {
                benefitCodes1.add(code);
            }
        }

        // Give coder 2 benefit for codes in their window that coder 1 explicitly has at this item
        for (const code of filteredBaseCodes1) {
            if (windowCodes2Set.has(code)) {
                benefitCodes2.add(code);
            }
        }

        // Calculate difference with benefit-only rolling window
        const codes1WithBenefit = Array.from(benefitCodes1);
        const codes2WithBenefit = Array.from(benefitCodes2);
        const difference = calculateDifference(codes1WithBenefit, codes2WithBenefit, codebook);

        comparisons.push({
            itemId: item1.id,
            codes1: baseCodes1, // Original codes
            codes2: baseCodes2, // Original codes
            adjustedCodes1: codes1WithBenefit, // Adjusted codes (with rolling window benefit)
            adjustedCodes2: codes2WithBenefit, // Adjusted codes (with rolling window benefit)
            difference,
        });
    }

    return comparisons;
};

/**
 * Calculate aggregate statistics for a set of item comparisons.
 *
 * @param comparisons - Array of item comparisons
 * @param coder1 - Name of first coder
 * @param coder2 - Name of second coder
 * @param codebook - The full codebook defining all possible codes
 * @returns Pairwise reliability metrics
 */
export const calculatePairwiseReliability = (
    comparisons: ItemComparison[],
    coder1: string,
    coder2: string,
    codebook: Codebook,
): PairwiseReliability => {
    if (comparisons.length === 0) {
        return {
            coder1,
            coder2,
            itemDifferences: {},
            meanDifference: 0,
            medianDifference: 0,
            stdDevDifference: 0,
            krippendorffsAlpha: 0,
            itemCount: 0,
        };
    }

    // Extract differences
    const itemDifferences = Object.fromEntries(comparisons.map((c) => [c.itemId, c.difference]));
    const differences = comparisons.map((c) => c.difference);

    // Calculate mean
    const meanDifference = differences.reduce((a, b) => a + b, 0) / differences.length;

    // Calculate median
    const sortedDifferences = [...differences].sort((a, b) => a - b);
    const medianDifference =
        sortedDifferences.length % 2 === 0
            ? (sortedDifferences[sortedDifferences.length / 2 - 1] +
                  sortedDifferences[sortedDifferences.length / 2]) /
              2
            : sortedDifferences[Math.floor(sortedDifferences.length / 2)];

    // Calculate standard deviation
    const variance =
        differences.reduce((acc, diff) => acc + Math.pow(diff - meanDifference, 2), 0) /
        differences.length;
    const stdDevDifference = Math.sqrt(variance);

    // Calculate Krippendorff's Alpha with full codebook using adjusted codes
    const krippendorffsAlpha = calculateKrippendorffsAlpha(comparisons, codebook, true);

    return {
        coder1,
        coder2,
        itemDifferences,
        meanDifference,
        medianDifference,
        stdDevDifference,
        krippendorffsAlpha,
        itemCount: comparisons.length,
    };
};

/**
 * Calculate Krippendorff's Alpha for nominal data with set-based coding.
 *
 * Uses the standard krippendorff package implementation with fixed-dimension
 * binary vectors based on the full codebook. This ensures consistent comparison
 * across all items and datasets.
 *
 * The metric ranges from -1 to 1, where:
 * - 1 = perfect agreement
 * - 0 = agreement by chance
 * - < 0 = systematic disagreement
 *
 * @param comparisons - Array of item comparisons
 * @param codebook - The full codebook defining all possible codes
 * @param useAdjustedCodes - Whether to use adjusted codes (true) or original codes (false)
 * @returns Krippendorff's Alpha coefficient
 */
export const calculateKrippendorffsAlpha = (
    comparisons: ItemComparison[],
    codebook: Codebook,
    useAdjustedCodes: boolean = true,
): number => {
    if (comparisons.length === 0) return 0;

    // Use ALL codes from the codebook as the fixed dimensions
    const allCodes = Object.keys(codebook);

    if (allCodes.length === 0) return 1; // No codes in codebook = perfect agreement

    const codeToIndex = new Map(allCodes.map((code, idx) => [code, idx]));

    // Transform set-based codes into binary vectors for each item
    // Each coder's rating becomes a binary vector indicating which codes are present
    // We'll convert this to a string representation for the krippendorff package
    const ratingMatrix: (string | undefined)[][] = [[], []]; // 2 coders (rows)

    for (const comp of comparisons) {
        // Use adjusted codes if available and requested, otherwise use original codes
        const codes1 = useAdjustedCodes ? comp.adjustedCodes1 : comp.codes1;
        const codes2 = useAdjustedCodes ? comp.adjustedCodes2 : comp.codes2;

        // Convert code sets to fixed-size binary vectors based on full codebook
        const vector1 = Array(allCodes.length).fill(0);
        const vector2 = Array(allCodes.length).fill(0);

        for (const code of codes1) {
            const index = codeToIndex.get(code);
            if (index !== undefined) {
                vector1[index] = 1;
            }
        }
        for (const code of codes2) {
            const index = codeToIndex.get(code);
            if (index !== undefined) {
                vector2[index] = 1;
            }
        }

        // Convert to string for nominal comparison
        ratingMatrix[0].push(vector1.join(","));
        ratingMatrix[1].push(vector2.join(","));
    }

    // Calculate alpha using the krippendorff package
    return alpha(ratingMatrix);
};

/**
 * Calculate precision, recall, and F1 score for each code.
 *
 * Uses coder1 as the reference point for comparison (not necessarily "ground truth").
 * Useful for comparing any two coders (human-human, AI-human, or AI-AI).
 *
 * Metrics interpretation:
 * - agreement: How many items both coders applied this code to
 * - coder2Only: How many items only coder2 applied this code to
 * - coder1Only: How many items only coder1 applied this code to
 * - precision: Of the times coder2 applied this code, how often did coder1 agree?
 * - recall: Of the times coder1 applied this code, how often did coder2 find it?
 *
 * @param comparisons - Array of item comparisons
 * @param useAdjustedCodes - Whether to use adjusted codes (true) or original codes (false)
 * @returns Array of code-level metrics for each code
 */
export const calculateCodeLevelMetrics = (
    comparisons: ItemComparison[],
    useAdjustedCodes: boolean = true,
): CodeLevelMetrics[] => {
    // Collect all codes (using adjusted codes if requested)
    const allCodes = new Set(
        comparisons.flatMap((c) =>
            useAdjustedCodes
                ? [...c.adjustedCodes1, ...c.adjustedCodes2]
                : [...c.codes1, ...c.codes2],
        ),
    );

    // Pre-convert all code arrays to Sets once (outside the loops)
    const codeSets = comparisons.map((c) => ({
        set1: new Set(useAdjustedCodes ? c.adjustedCodes1 : c.codes1),
        set2: new Set(useAdjustedCodes ? c.adjustedCodes2 : c.codes2),
    }));

    const metrics: CodeLevelMetrics[] = [];

    // Calculate metrics for each code
    for (const code of allCodes) {
        let agreement = 0;
        let coder2Only = 0;
        let coder1Only = 0;

        for (const { set1, set2 } of codeSets) {
            const inCodes1 = set1.has(code);
            const inCodes2 = set2.has(code);

            if (inCodes1 && inCodes2) {
                agreement++;
            } else if (!inCodes1 && inCodes2) {
                coder2Only++;
            } else if (inCodes1 && !inCodes2) {
                coder1Only++;
            }
            // Neither coder applied the code - not tracked
        }

        // Calculate precision, recall, F1
        const precision = agreement + coder2Only > 0 ? agreement / (agreement + coder2Only) : 0;
        const recall = agreement + coder1Only > 0 ? agreement / (agreement + coder1Only) : 0;
        const f1Score =
            precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

        metrics.push({
            code,
            agreement,
            coder2Only,
            coder1Only,
            precision,
            recall,
            f1Score,
        });
    }

    // Sort by code label
    return metrics.sort((a, b) => a.code.localeCompare(b.code));
};
