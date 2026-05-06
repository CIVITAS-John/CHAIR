import type { Code, Codebook, DataChunk, DataItem } from "../schema.js";
import type { ConsolidateStep } from "../steps/consolidate-step.js";

/**
 * Item-level difference calculation function type.
 * Takes two arrays of code labels and the codebook, returns a difference score.
 *
 * @param codes1 - First coder's codes for the item
 * @param codes2 - Second coder's codes for the item
 * @param codebook - The full codebook defining all possible codes
 * @returns Difference score (0 = identical, 1 = completely different)
 */
export type DifferenceCalculator = (
    codes1: string[],
    codes2: string[],
    codebook: Codebook,
) => number;

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
    /** Precision: agreement / (agreement + coder2Only) */
    precision: number;
    /** Recall: agreement / (agreement + coder1Only) */
    recall: number;
    /** F1 score: 2 * (precision * recall) / (precision + recall) */
    f1Score: number;
}

export type ReliabilityComparisonLevel = "item" | "chunk";

/**
 * Configuration for ReliabilityStep.
 */
export interface ReliabilityStepConfig<
    TSubunit extends DataItem = DataItem,
    TUnit extends DataChunk<TSubunit> = DataChunk<TSubunit>,
> {
    /**
     * ConsolidateStep providing codebooks and coded threads.
     */
    consolidator: ConsolidateStep<TSubunit, TUnit>;

    /**
     * Subdirectory for reliability outputs.
     */
    subdir?: string;

    /**
     * Optional function to skip certain items during comparison.
     *
     * @param item - The data item to evaluate
     * @returns true to skip this item, false to include it
     */
    skipItem?: (item: DataItem) => boolean;

    /**
     * Optional custom function to calculate item-level difference.
     */
    calculateDifference?: DifferenceCalculator;

    /**
     * Optional function to skip certain codes during comparison.
     *
     * @param label - The code label
     * @param code - The Code object if found in codebook, undefined otherwise
     * @returns true to skip this code, false to include it
     */
    skipCodes?: (label: string, code: Code | undefined) => boolean;

    /**
     * Whether to anonymize coder identities in outputs.
     */
    anonymize?: boolean;

    /**
     * Comparison levels to calculate.
     */
    comparisonLevels?: ReliabilityComparisonLevel[];

    /**
     * Size of rolling window for item-level aggregate comparison.
     */
    rollingWindow?: number;
}

/**
 * Reliability analysis results for one comparison level.
 */
export interface ReliabilityLevelResults {
    /** Pairwise reliability metrics for all coder pairs */
    pairwise: Record<string, PairwiseReliability>;

    /** Code-level precision/recall metrics for all coder pairs */
    codeLevelMetrics: Record<string, CodeLevelMetrics[]>;
}

/**
 * Reliability analysis results for a single dataset.
 */
export interface ReliabilityResults {
    /** Metadata about the analysis */
    metadata: {
        /** Timestamp when analysis was performed */
        timestamp: string;
        /** Name of the dataset analyzed */
        datasetName: string;
        /** Number of coders compared */
        coderCount: number;
        /** List of coder names */
        coderNames: string[];
        /** Comparison levels included in the report */
        comparisonLevels: ReliabilityComparisonLevel[];
        /** Whether coder identities were anonymized */
        anonymized: boolean;
        /** Whether custom difference calculator was used */
        customDifferenceCalculator: boolean;
        /** Whether item filter was applied */
        filterApplied: boolean;
        /** Size of rolling window if applied (benefit-only comparison) */
        rollingWindowSize?: number;
        /** Whether code filtering was applied */
        codeFilterApplied: boolean;
        /** List of codes that were skipped during comparison */
        skippedCodes?: string[];
        /** Total number of unique codes in the dataset */
        totalCodesCount?: number;
        /** Number of codes actually compared */
        comparedCodesCount?: number;
    };

    /** Reliability metrics keyed by comparison level */
    results: Partial<Record<ReliabilityComparisonLevel, ReliabilityLevelResults>>;
}
