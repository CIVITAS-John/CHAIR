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

import type { Code, Codebook, CodedItem, CodedThread, DataItem } from "../schema.js";

/**
 * Item-level difference calculation function type.
 * Takes two arrays of code labels and the codebook, returns a difference score.
 * Uses binary matrix representation where each code in the codebook is a dimension.
 *
 * @param codes1 - First coder's codes for the item
 * @param codes2 - Second coder's codes for the item
 * @param codebook - The full codebook defining all possible codes
 * @returns Difference score (0 = identical, 1 = completely different)
 */
export type DifferenceCalculator = (codes1: string[], codes2: string[], codebook: Codebook) => number;

/**
 * Results from comparing two coders on a single item.
 */
export interface ItemComparison {
    /** The item ID being compared */
    itemId: string;
    /** Original codes applied by first coder */
    codes1: string[];
    /** Original codes applied by second coder */
    codes2: string[];
    /** Adjusted codes for first coder (after applying rolling window or filtering) */
    adjustedCodes1: string[];
    /** Adjusted codes for second coder (after applying rolling window or filtering) */
    adjustedCodes2: string[];
    /** Calculated difference score (using adjusted codes) */
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
): ItemComparison[] => {
    // Create lookup maps for both coders' items
    const items1Map = new Map(items1.map((item) => [item.id, item]));
    const items2Map = new Map(items2.map((item) => [item.id, item]));

    // Collect all unique item IDs from both coders
    const allItemIds = new Set([
        ...items1.map(item => item.id),
        ...items2.map(item => item.id)
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

        // Only include items where at least one coder has applied codes
        const codes1 = item1.codes || [];
        const codes2 = item2.codes || [];
        if (codes1.length === 0 && codes2.length === 0) continue;

        filteredPairs.push({ item1, item2 });
    }

    // Helper function to filter codes if skipCodes is provided
    const filterCodes = (codes: string[]): string[] => {
        if (!skipCodes) return codes;
        return codes.filter(label => {
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

    // Rolling window comparison (benefit-only)
    const comparisons: ItemComparison[] = [];

    for (let i = 0; i < filteredPairs.length; i++) {
        const { item1, item2 } = filteredPairs[i];

        // Get base codes for this item
        const baseCodes1 = item1.codes ?? [];
        const baseCodes2 = item2.codes ?? [];

        // Filter base codes if skipCodes function is provided
        const filteredBaseCodes1 = filterCodes(baseCodes1);
        const filteredBaseCodes2 = filterCodes(baseCodes2);

        // Collect codes from rolling window for both coders
        const windowStart = Math.max(0, i - rollingWindow);
        const windowEnd = Math.min(filteredPairs.length - 1, i + rollingWindow);

        // Aggregate codes within window (with filtering)
        const windowCodes1Set = new Set<string>();
        const windowCodes2Set = new Set<string>();

        for (let j = windowStart; j <= windowEnd; j++) {
            const codes1 = filterCodes(filteredPairs[j].item1.codes ?? []);
            const codes2 = filterCodes(filteredPairs[j].item2.codes ?? []);

            codes1.forEach((code) => windowCodes1Set.add(code));
            codes2.forEach((code) => windowCodes2Set.add(code));
        }

        // Apply benefit-only logic:
        // - Start with filtered base codes at exact position
        // - For each code in union: if BOTH coders have it in their windows, add to intersection (benefit)
        const allCodes = new Set([...filteredBaseCodes1, ...filteredBaseCodes2]);
        const benefitCodes1 = new Set(filteredBaseCodes1);
        const benefitCodes2 = new Set(filteredBaseCodes2);

        // Add windowed matches (benefit-only)
        for (const code of allCodes) {
            // If both coders have this code somewhere in their windows, give benefit
            if (windowCodes1Set.has(code) && windowCodes2Set.has(code)) {
                benefitCodes1.add(code);
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
    useAdjustedCodes: boolean = true
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
    useAdjustedCodes: boolean = true
): CodeLevelMetrics[] => {
    // Collect all codes (using adjusted codes if requested)
    const allCodes = new Set(comparisons.flatMap((c) =>
        useAdjustedCodes
            ? [...c.adjustedCodes1, ...c.adjustedCodes2]
            : [...c.codes1, ...c.codes2]
    ));

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
