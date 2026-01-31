/**
 * Rolling Window Utility Module
 *
 * Provides a reusable rolling window aggregator for collecting data
 * across neighboring items in a sequence. Used by EnsembleCodeStep
 * and ReliabilityStep for aggregate comparisons.
 */

/**
 * Generic rolling window aggregator
 *
 * Aggregates data from items within a window around each position.
 * Can be used for various types of data that need context-aware aggregation.
 *
 * @template T - Type of items being windowed
 * @template V - Type of values being aggregated
 */
export class RollingWindowAggregator<T, V = string> {
    constructor(private readonly windowSize: number) {
        if (windowSize < 0) {
            throw new Error("Window size must be non-negative");
        }
    }

    /**
     * Aggregate values from items within rolling windows
     *
     * For each item at position i, aggregates values from items in range
     * [i-windowSize, ..., i, ..., i+windowSize]. Edge cases use only available items.
     *
     * @param items - Ordered list of items
     * @param getId - Function to extract unique ID from each item
     * @param getValues - Function to extract values from each item
     * @returns Map of item ID to aggregated values for that window
     */
    aggregate(
        items: T[],
        getId: (item: T) => string,
        getValues: (item: T) => V[]
    ): Map<string, Set<V>> {
        const windowData = new Map<string, Set<V>>();

        for (let i = 0; i < items.length; i++) {
            const windowStart = Math.max(0, i - this.windowSize);
            const windowEnd = Math.min(items.length - 1, i + this.windowSize);

            const aggregatedValues = new Set<V>();
            for (let j = windowStart; j <= windowEnd; j++) {
                const values = getValues(items[j]);
                values.forEach(value => aggregatedValues.add(value));
            }

            windowData.set(getId(items[i]), aggregatedValues);
        }

        return windowData;
    }

    /**
     * Get the effective window size for a given position
     *
     * Useful for understanding edge effects at the beginning/end of sequences.
     *
     * @param position - Index position in the sequence
     * @param totalItems - Total number of items
     * @returns Actual number of items in the window for this position
     */
    getEffectiveWindowSize(position: number, totalItems: number): number {
        const windowStart = Math.max(0, position - this.windowSize);
        const windowEnd = Math.min(totalItems - 1, position + this.windowSize);
        return windowEnd - windowStart + 1;
    }
}

/**
 * Convenience function for creating a rolling window aggregator
 *
 * @param windowSize - Number of items to include on each side
 * @returns New RollingWindowAggregator instance
 */
export function createRollingWindow<T, V = string>(
    windowSize: number
): RollingWindowAggregator<T, V> {
    return new RollingWindowAggregator<T, V>(windowSize);
}