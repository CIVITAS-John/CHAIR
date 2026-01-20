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

import type { CodedItem, CodedThread, DataItem } from "../schema.js";

/**
 * Item-level difference calculation function type.
 * Takes two arrays of code labels and returns a difference score.
 *
 * @param codes1 - First coder's codes for the item
 * @param codes2 - Second coder's codes for the item
 * @returns Difference score (0 = identical, higher = more different)
 */
export type DifferenceCalculator = (codes1: string[], codes2: string[]) => number;

/**
 * Results from comparing two coders on a single item.
 */
export interface ItemComparison {
    /** The item ID being compared */
    itemId: string;
    /** Codes applied by first coder */
    codes1: string[];
    /** Codes applied by second coder */
    codes2: string[];
    /** Calculated difference score */
    difference: number;
}

/**
 * Aggregate reliability metrics for a pair of coders.
 */
export interface PairwiseReliability {
    /** Name of first coder */
    coder1: string;
    /** Name of second coder */
    coder2: string;
    /** Item-level differences by item ID */
    itemDifferences: Record<string, number>;
    /** Mean difference across all items */
    meanDifference: number;
    /** Median difference across all items */
    medianDifference: number;
    /** Standard deviation of differences */
    stdDevDifference: number;
    /** Percent of items with exact agreement */
    percentAgreement: number;
    /** Krippendorff's Alpha coefficient */
    krippendorffsAlpha: number;
    /** Total number of items compared */
    itemCount: number;
}

/**
 * Per-code precision and recall metrics.
 *
 * Note: These metrics use coder1 as the reference point (not necessarily "ground truth").
 * Precision/recall are relative to coder1's coding decisions.
 */
export interface CodeLevelMetrics {
    /** Code label */
    code: string;
    /** Agreement: both coders applied this code */
    agreement: number;
    /** Coder2 only: only coder2 applied this code */
    coder2Only: number;
    /** Coder1 only: only coder1 applied this code */
    coder1Only: number;
    /** Precision: agreement / (agreement + coder2Only) - how often coder2 was correct when they applied the code */
    precision: number;
    /** Recall: agreement / (agreement + coder1Only) - what proportion of coder1's codes did coder2 find */
    recall: number;
    /** F1 score: 2 * (precision * recall) / (precision + recall) */
    f1Score: number;
}

/**
 * Default Jaccard distance calculator for code sets.
 *
 * Jaccard distance = 1 - Jaccard similarity
 * Jaccard similarity = |intersection| / |union|
 *
 * Handles the case where both coders applied no codes (returns 0).
 * Well-suited for multiple codes per item.
 *
 * @param codes1 - First coder's codes
 * @param codes2 - Second coder's codes
 * @returns Jaccard distance (0 = identical, 1 = completely different)
 */
export const defaultCalculateDifference: DifferenceCalculator = (
    codes1: string[],
    codes2: string[],
): number => {
    // Handle edge case: both coders applied no codes (perfect agreement)
    if (codes1.length === 0 && codes2.length === 0) return 0;

    // Convert to sets for intersection/union calculation
    const set1 = new Set(codes1);
    const set2 = new Set(codes2);

    // Calculate intersection size
    const intersection = new Set([...set1].filter((x) => set2.has(x)));

    // Calculate union size
    const union = new Set([...set1, ...set2]);

    // Jaccard distance = 1 - Jaccard similarity
    return 1 - intersection.size / union.size;
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
 * Compare two coders on a set of items using a difference calculator.
 *
 * @param items1 - Coded items from first coder
 * @param items2 - Coded items from second coder
 * @param calculateDifference - Function to calculate item-level difference
 * @param skipItem - Optional function to skip certain items
 * @param dataItems - Map of item IDs to original data items for filtering
 * @returns Array of item comparisons
 */
export const compareItems = (
    items1: CodedItem[],
    items2: CodedItem[],
    calculateDifference: DifferenceCalculator = defaultCalculateDifference,
    skipItem?: (item: DataItem) => boolean,
    dataItems?: Map<string, DataItem>,
): ItemComparison[] => {
    // Create lookup map for second coder's items
    const items2Map = new Map(items2.map((item) => [item.id, item]));

    const comparisons: ItemComparison[] = [];

    // Compare each item from first coder
    for (const item1 of items1) {
        // Skip if filter function returns true
        if (skipItem && dataItems) {
            const dataItem = dataItems.get(item1.id);
            if (dataItem && skipItem(dataItem)) continue;
        }

        // Find corresponding item from second coder
        const item2 = items2Map.get(item1.id);
        if (!item2) continue; // Skip if item not found in second coder

        // Extract codes (default to empty array if undefined)
        const codes1 = item1.codes ?? [];
        const codes2 = item2.codes ?? [];

        // Calculate difference
        const difference = calculateDifference(codes1, codes2);

        comparisons.push({
            itemId: item1.id,
            codes1,
            codes2,
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
 * @returns Pairwise reliability metrics
 */
export const calculatePairwiseReliability = (
    comparisons: ItemComparison[],
    coder1: string,
    coder2: string,
): PairwiseReliability => {
    if (comparisons.length === 0) {
        return {
            coder1,
            coder2,
            itemDifferences: {},
            meanDifference: 0,
            medianDifference: 0,
            stdDevDifference: 0,
            percentAgreement: 0,
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

    // Calculate percent agreement (items with difference = 0)
    const exactMatches = differences.filter((d) => d === 0).length;
    const percentAgreement = (exactMatches / differences.length) * 100;

    // Calculate Krippendorff's Alpha
    const krippendorffsAlpha = calculateKrippendorffsAlpha(comparisons);

    return {
        coder1,
        coder2,
        itemDifferences,
        meanDifference,
        medianDifference,
        stdDevDifference,
        percentAgreement,
        krippendorffsAlpha,
        itemCount: comparisons.length,
    };
};

/**
 * Calculate Krippendorff's Alpha for nominal data with set-based coding.
 *
 * Uses the standard krippendorff package implementation. For set-based coding
 * (where items can have multiple codes), we convert code sets to a standardized
 * format compatible with the library's nominal metric.
 *
 * The metric ranges from -1 to 1, where:
 * - 1 = perfect agreement
 * - 0 = agreement by chance
 * - < 0 = systematic disagreement
 *
 * @param comparisons - Array of item comparisons
 * @returns Krippendorff's Alpha coefficient
 */
export const calculateKrippendorffsAlpha = (comparisons: ItemComparison[]): number => {
    if (comparisons.length === 0) return 0;

    // Build a mapping from all unique codes to indices
    const allCodes = new Set<string>();
    for (const comp of comparisons) {
        for (const code of [...comp.codes1, ...comp.codes2]) {
            allCodes.add(code);
        }
    }

    if (allCodes.size === 0) return 1; // No codes applied = perfect agreement

    const codeToIndex = new Map(Array.from(allCodes).map((code, idx) => [code, idx]));

    // Transform set-based codes into binary vectors for each item
    // Each coder's rating becomes a binary vector indicating which codes are present
    // We'll convert this to a string representation for the krippendorff package
    const ratingMatrix: (string | undefined)[][] = [[], []]; // 2 coders (rows)

    for (const comp of comparisons) {
        // Convert code sets to binary vectors, then to string for nominal comparison
        const vector1 = Array(allCodes.size).fill(0);
        const vector2 = Array(allCodes.size).fill(0);

        for (const code of comp.codes1) {
            vector1[codeToIndex.get(code)!] = 1;
        }
        for (const code of comp.codes2) {
            vector2[codeToIndex.get(code)!] = 1;
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
 * @returns Array of code-level metrics for each code
 */
export const calculateCodeLevelMetrics = (comparisons: ItemComparison[]): CodeLevelMetrics[] => {
    // Collect all codes
    const allCodes = new Set(comparisons.flatMap((c) => [...c.codes1, ...c.codes2]));

    // Pre-convert all code arrays to Sets once (outside the loops)
    const codeSets = comparisons.map((c) => ({
        set1: new Set(c.codes1),
        set2: new Set(c.codes2),
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
        const precision =
            agreement + coder2Only > 0 ? agreement / (agreement + coder2Only) : 0;
        const recall =
            agreement + coder1Only > 0 ? agreement / (agreement + coder1Only) : 0;
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
