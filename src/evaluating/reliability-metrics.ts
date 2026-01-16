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

import type { CodedItem, CodedThread } from "../schema.js";

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
 */
export interface CodeLevelMetrics {
    /** Code label */
    code: string;
    /** True positives: both coders applied this code */
    truePositives: number;
    /** False positives: only coder2 applied this code */
    falsePositives: number;
    /** False negatives: only coder1 applied this code */
    falseNegatives: number;
    /** Precision: TP / (TP + FP) */
    precision: number;
    /** Recall: TP / (TP + FN) */
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
export const extractCodedItems = (threads: Record<string, CodedThread>): CodedItem[] => {
    const items: CodedItem[] = [];

    for (const thread of Object.values(threads)) {
        for (const item of Object.values(thread.items)) {
            items.push(item);
        }
    }

    return items;
};

/**
 * Compare two coders on a set of items using a difference calculator.
 *
 * @param items1 - Coded items from first coder
 * @param items2 - Coded items from second coder
 * @param calculateDifference - Function to calculate item-level difference
 * @param skipItem - Optional function to skip certain items
 * @returns Array of item comparisons
 */
export const compareItems = (
    items1: CodedItem[],
    items2: CodedItem[],
    calculateDifference: DifferenceCalculator = defaultCalculateDifference,
    skipItem?: (item: CodedItem) => boolean,
): ItemComparison[] => {
    const comparisons: ItemComparison[] = [];

    // Create lookup map for second coder's items
    const items2Map = new Map<string, CodedItem>();
    for (const item of items2) {
        items2Map.set(item.id, item);
    }

    // Compare each item from first coder
    for (const item1 of items1) {
        // Skip if filter function returns true
        if (skipItem && skipItem(item1)) continue;

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
    const differences = comparisons.map((c) => c.difference);
    const itemDifferences: Record<string, number> = {};
    for (const comp of comparisons) {
        itemDifferences[comp.itemId] = comp.difference;
    }

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
 * This is a simplified implementation that treats each item as having a set of codes.
 * The metric ranges from -1 to 1, where:
 * - 1 = perfect agreement
 * - 0 = agreement by chance
 * - < 0 = systematic disagreement
 *
 * Formula: α = 1 - (observed disagreement / expected disagreement)
 *
 * @param comparisons - Array of item comparisons
 * @returns Krippendorff's Alpha coefficient
 */
export const calculateKrippendorffsAlpha = (comparisons: ItemComparison[]): number => {
    if (comparisons.length === 0) return 0;

    // Calculate observed disagreement (mean of item differences)
    const observedDisagreement =
        comparisons.reduce((sum, c) => sum + c.difference, 0) / comparisons.length;

    // Calculate expected disagreement by chance
    // Collect all codes used by both coders
    const allCodes = new Set<string>();
    const codeFrequencies: Record<string, number> = {};

    for (const comp of comparisons) {
        for (const code of [...comp.codes1, ...comp.codes2]) {
            allCodes.add(code);
            codeFrequencies[code] = (codeFrequencies[code] || 0) + 1;
        }
    }

    // Calculate expected disagreement based on code distributions
    // This is a simplified calculation assuming independence
    const totalCodeApplications = Object.values(codeFrequencies).reduce((a, b) => a + b, 0);

    if (totalCodeApplications === 0) return 1; // No codes applied = perfect agreement

    // Expected Jaccard distance under random assignment
    // For simplicity, we estimate this as the complement of the probability
    // that two randomly selected code sets would overlap
    let expectedOverlap = 0;
    for (const freq of Object.values(codeFrequencies)) {
        const prob = freq / totalCodeApplications;
        expectedOverlap += prob * prob; // Probability of same code appearing in both sets
    }

    const expectedDisagreement = 1 - expectedOverlap;

    // Avoid division by zero
    if (expectedDisagreement === 0) return 1;

    // Calculate Krippendorff's Alpha
    const alpha = 1 - observedDisagreement / expectedDisagreement;

    return alpha;
};

/**
 * Calculate precision, recall, and F1 score for each code.
 *
 * Treats coder1 as the "ground truth" and coder2 as the "prediction".
 * Useful for evaluating AI coders against human coders.
 *
 * @param comparisons - Array of item comparisons
 * @returns Array of code-level metrics for each code
 */
export const calculateCodeLevelMetrics = (comparisons: ItemComparison[]): CodeLevelMetrics[] => {
    // Collect all codes
    const allCodes = new Set<string>();
    for (const comp of comparisons) {
        for (const code of [...comp.codes1, ...comp.codes2]) {
            allCodes.add(code);
        }
    }

    const metrics: CodeLevelMetrics[] = [];

    // Calculate metrics for each code
    for (const code of allCodes) {
        let truePositives = 0;
        let falsePositives = 0;
        let falseNegatives = 0;

        for (const comp of comparisons) {
            const inCodes1 = comp.codes1.includes(code);
            const inCodes2 = comp.codes2.includes(code);

            if (inCodes1 && inCodes2) {
                truePositives++;
            } else if (!inCodes1 && inCodes2) {
                falsePositives++;
            } else if (inCodes1 && !inCodes2) {
                falseNegatives++;
            }
            // True negatives not tracked (neither coder applied the code)
        }

        // Calculate precision, recall, F1
        const precision =
            truePositives + falsePositives > 0 ? truePositives / (truePositives + falsePositives) : 0;
        const recall =
            truePositives + falseNegatives > 0 ? truePositives / (truePositives + falseNegatives) : 0;
        const f1Score =
            precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

        metrics.push({
            code,
            truePositives,
            falsePositives,
            falseNegatives,
            precision,
            recall,
            f1Score,
        });
    }

    // Sort by code label
    return metrics.sort((a, b) => a.code.localeCompare(b.code));
};
