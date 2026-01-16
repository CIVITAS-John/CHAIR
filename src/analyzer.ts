/**
 * Analyzer Module
 *
 * Provides the core framework for analyzing qualitative data in chunks.
 * This module handles the complex logic of:
 * - Breaking large datasets into processable chunks
 * - Managing iteration and retry logic
 * - Coordinating with LLM services for analysis
 * - Tracking progress through cursor-based navigation
 *
 * The analyzer uses an async context pattern to access shared resources
 * like datasets and session information without explicit parameter passing.
 */

import { BaseStep } from "./steps/base-step.js";
import { logger } from "./utils/core/logger.js";

/**
 * Base error class for all analyzer-related errors.
 * Provides consistent error formatting with optional source information.
 */
abstract class AnalyzerError extends Error {
    override name = "Analyzer.Error";
    constructor(message: string, source?: string) {
        super(`${source ? `${source}: ` : ""}${message}`);
    }
}

/**
 * Abstract base class for analyzing units of data.
 *
 * This class provides a flexible framework for processing data in chunks with LLM analysis.
 * Subclasses must implement methods to:
 * - Build prompts from data chunks
 * - Parse LLM responses
 * - Filter and preprocess data
 *
 * The analyzer handles complex concerns like:
 * - Chunk sizing with context windows (prefetch/postfetch)
 * - Multi-iteration refinement
 * - Retry logic for failed analyses
 * - Progress tracking via cursor management
 *
 * @template TUnit - Type of the main data unit being analyzed (e.g., conversation, document)
 * @template TSubunit - Type of the subunit within the main unit (e.g., message, paragraph)
 * @template TAnalysis - Type of the analysis result container (e.g., CodedThread)
 */
export abstract class Analyzer<TUnit, TSubunit, TAnalysis> {
    static Error = AnalyzerError;

    /** Error thrown when LLM response doesn't match expected format */
    static InvalidResponseError = class extends AnalyzerError {
        override name = "Analyzer.InvalidResponseError";
    };

    /** Error thrown for internal processing failures */
    static InternalError = class extends AnalyzerError {
        override name = "Analyzer.InternalError";
    };

    /** Get a prefixed logger for consistent log formatting */
    protected get _prefix() {
        return logger.prefixed(logger.prefix, this.name);
    }

    /** Human-readable name identifying this analyzer instance */
    name = "Unnamed";
    /** Optional suffix appended to output files */
    suffix = "";
    /** Base temperature parameter for LLM sampling (0 = deterministic, higher = more random) */
    baseTemperature = 0;
    /** Number of times to iterate over the entire dataset (useful for refinement) */
    maxIterations = 1;
    /** Additional instructions appended to LLM prompts */
    customPrompt: string;

    constructor({
        name,
        prompt,
    }: {
        name?: string;
        prompt?: string;
    } = {}) {
        this.name = name ?? this.name;
        this.customPrompt = prompt ? `\n${prompt}` : "";
    }

    /**
     * Determines chunk size and context window for each LLM request.
     *
     * This method controls how subunits are grouped and what context is provided:
     * - **Number return**: Simple chunk size without extra context
     * - **Tuple return [size, prefetch, postfetch]**: Chunk size with surrounding context
     *
     * Examples:
     * - `return recommended`: Use recommended size (typically session.config.batchSize)
     * - `return 1`: Process one subunit at a time (no context, not recommended)
     * - `return [1, 1, 1]`: Process one subunit with previous and next as context
     * - `return remaining`: Process all remaining subunits in one chunk
     * - `return -1`: Signal to stop processing immediately
     *
     * The prefetch/postfetch context is included in buildPrompts but NOT coded.
     * For example, with [1, 1, 1], buildPrompts receives subunits [0, 1, 2], but
     * chunkStart=1 indicates only subunit 1 should be analyzed.
     *
     * @param recommended - The recommended chunk size (usually LLM's max items)
     * @param _remaining - Number of subunits left to process
     * @param _iteration - Current iteration number (0-indexed)
     * @param _tries - Current retry attempt (0-indexed)
     * @returns Chunk size or [chunk size, prefetch count, postfetch count]
     */
    getChunkSize(
        recommended: number,
        _remaining: number,
        _iteration: number,
        _tries: number,
    ): number | [number, number, number] {
        return recommended;
    }

    /**
     * Performs initial batch preprocessing on all units before analysis begins.
     *
     * This hook runs once before any iteration or chunking occurs. Use it to:
     * - Initialize shared resources
     * - Compute dataset-wide statistics
     * - Load external data needed for analysis
     *
     * @param _units - All units that will be analyzed
     * @param _analyzed - Empty analysis containers for each unit
     */
    async batchPreprocess(_units: TUnit[], _analyzed: TAnalysis[]): Promise<void> {
        // This method is intentionally left empty
    }

    /**
     * Preprocesses subunits before filtering and chunking for each iteration.
     *
     * This hook runs at the start of each iteration and can:
     * - Transform subunits (e.g., add metadata)
     * - Filter out already-processed items
     * - Reorder subunits
     * - Return a completely different set of subunits
     *
     * @param _analysis - The analysis container for this unit
     * @param _source - The original unit being analyzed
     * @param subunits - The subunits to preprocess
     * @param _iteration - Current iteration number (0-indexed)
     * @returns Modified array of subunits
     */
    async preprocess(
        _analysis: TAnalysis,
        _source: TUnit,
        subunits: TSubunit[],
        _iteration: number,
    ): Promise<TSubunit[]> {
        return await Promise.resolve(subunits);
    }

    /**
     * Filters which subunits should be processed in this iteration.
     *
     * This filter is applied after preprocessing. Use it to:
     * - Skip already-coded items
     * - Focus on specific subunit types
     * - Implement conditional processing logic
     *
     * @param _Subunit - The subunit to evaluate
     * @param _Iteration - Current iteration number (0-indexed)
     * @returns true to include this subunit, false to skip it
     */
    subunitFilter(_Subunit: TSubunit, _Iteration: number): boolean {
        return true;
    }

    /**
     * Builds the system and user prompts for the LLM.
     *
     * This is the core method where you construct prompts from data chunks.
     * The subunits array includes prefetch/postfetch context, and chunkStart
     * indicates where the actual chunk begins.
     *
     * Example with getChunkSize returning [2, 1, 1]:
     * - subunits = [item0, item1, item2, item3, item4]
     * - chunkStart = 1 (skip the prefetch item)
     * - Items to code: item1, item2 (2 items starting at index 1)
     * - Context items: item0 (prefetch), item3, item4 (postfetch)
     *
     * @param _analysis - The analysis container for this unit
     * @param _source - The original unit being analyzed
     * @param _subunits - Array of subunits including context (prefetch + chunk + postfetch)
     * @param _chunkStart - Index where the actual chunk starts (skip prefetch items)
     * @param _iteration - Current iteration number (0-indexed)
     * @returns Tuple of [system prompt, user prompt]
     */
    async buildPrompts(
        _analysis: TAnalysis,
        _source: TUnit,
        _subunits: TSubunit[],
        _chunkStart: number,
        _iteration: number,
    ): Promise<[string, string]> {
        return await Promise.resolve(["", ""]);
    }

    /**
     * Parses the LLM response and extracts analysis results.
     *
     * This method interprets the LLM's output and updates the analysis container.
     * It can return either:
     *
     * 1. **Record<number, string>**: For item-level coding where each key is a subunit
     *    index and value is the analysis for that item. Return {} if not applicable.
     *
     * 2. **number**: Cursor adjustment when actual items processed differs from expected.
     *    - Positive: Processed more items than expected (cursor moves forward faster)
     *    - Negative: Processed fewer items than expected (often due to LLM skipping items)
     *    - Zero: Processed exactly as expected
     *
     * Example: If chunk size is 5 but LLM only coded 3 items, return -2.
     *
     * @param _analysis - The analysis container to update
     * @param _lines - The LLM response split into lines
     * @param _subunits - The subunits that were sent to the LLM
     * @param _chunkStart - Index where the actual chunk started
     * @param _iteration - Current iteration number (0-indexed)
     * @returns Item-level results map or cursor adjustment number
     */
    async parseResponse(
        _analysis: TAnalysis,
        _lines: string[],
        _subunits: TSubunit[],
        _chunkStart: number,
        _iteration: number,
    ): Promise<Record<number, string> | number> {
        return await Promise.resolve({});
    }
}

/**
 * Process data through the analyzer in a chunked, iterative manner.
 *
 * This is the core orchestration function that handles:
 *
 * **Iteration Lifecycle:**
 * 1. Multiple iterations over the entire dataset (for refinement)
 * 2. Preprocessing and filtering at the start of each iteration
 * 3. Cursor-based navigation through filtered subunits
 * 4. Callback execution after each iteration
 *
 * **Chunking Algorithm:**
 * - Maintains a cursor position in the filtered subunits array
 * - Gets chunk size from analyzer (may include prefetch/postfetch context)
 * - Slices subunits to include context window
 * - Passes chunk to action function for processing
 * - Advances cursor based on processed items + relative adjustment
 *
 * **Retry Mechanism:**
 * - Each chunk can be retried up to `retries` times
 * - On failure, marks items as processed to continue with next chunk
 * - On success, validates at least one item was processed
 * - Throws error if all retries exhausted
 *
 * **Cursor Movement:**
 * - Expected movement = chunkSize[0] (the main chunk size)
 * - Actual movement = chunkSize[0] + cursorRelative
 * - cursorRelative can be negative if LLM skipped items
 * - Prevents infinite loops by requiring at least one item processed
 *
 * **Progress Tracking:**
 * - Updates session.expectedItems with chunk sizes
 * - Updates session.finishedItems with actual processed count
 * - Logs warnings when actual != expected
 *
 * @param analyzer - The analyzer instance defining processing behavior
 * @param analysis - The analysis result container to populate
 * @param source - The main data unit being analyzed (for context)
 * @param sources - Array of subunits to process (will be mutated by preprocessing)
 * @param action - Async function to process each chunk; returns cursor adjustment
 * @param onIterate - Optional callback invoked after each iteration completes
 * @param retries - Maximum retry attempts per chunk (default: 5)
 * @returns Promise that resolves when all iterations and chunks are processed
 * @throws {BaseStep.ContextVarNotFoundError} If session not found in context
 * @throws {Analyzer.InternalError} If chunk processing fails after all retries
 */
export const loopThroughChunk = <TUnit, TSubunit, TAnalysis>(
    analyzer: Analyzer<TUnit, TSubunit, TAnalysis>,
    analysis: TAnalysis,
    source: TUnit,
    sources: TSubunit[],
    action: (
        currents: TSubunit[],
        chunkStart: number,
        isFirst: boolean,
        tries: number,
        iteration: number,
    ) => Promise<number>,
    onIterate?: (iteration: number) => Promise<void>,
    retries = 5,
) =>
    logger.withDefaultSource("loopThroughChunk", async () => {
        // Retrieve shared context using async-local storage pattern
        const { dataset, session } = BaseStep.Context.get();
        if (!session) {
            throw new BaseStep.ContextVarNotFoundError("session");
        }

        // Outer loop: Multiple iterations for refinement/multi-pass analysis
        for (let i = 0; i < analyzer.maxIterations; i++) {
            // Preprocess subunits for this iteration (may transform or filter)
            sources = await analyzer.preprocess(analysis, source, sources, i);
            if (sources.length === 0) {
                continue; // Skip empty iterations
            }
            logger.info(`[${dataset.name}] Iteration ${i + 1}/${analyzer.maxIterations}`);

            // Apply filter to determine which subunits to process
            let cursor = 0; // Current position in filtered array
            const filtered = sources.filter((subunit) => analyzer.subunitFilter(subunit, i));
            logger.info(`[${dataset.name}] ${filtered.length} subunits filtered`);

            // Inner loop: Process filtered subunits chunk by chunk
            while (cursor < filtered.length) {
                logger.debug(`[${dataset.name}] Cursor at ${cursor}/${filtered.length}`);
                let tries = 0; // Retry counter for current chunk
                let cursorRelative = 0; // Adjustment to cursor (from parseResponse)
                let chunkSize = [0, 0, 0]; // [main chunk, prefetch, postfetch]

                // Retry loop: Attempt to process current chunk
                while (tries < retries) {
                    // Get chunk configuration from analyzer
                    const _chunkSize = analyzer.getChunkSize(
                        Math.min(session.config.batchSize ?? 32, filtered.length - cursor),
                        filtered.length - cursor,
                        i,
                        tries,
                    );
                    logger.debug(`[${dataset.name}] Chunk size: ${JSON.stringify(_chunkSize)}`);

                    // Normalize chunk size to tuple format
                    if (typeof _chunkSize === "number") {
                        if (_chunkSize < 0) {
                            // Negative chunk size signals immediate stop
                            logger.warn(
                                `[${dataset.name}] Stopped iteration due to signals sent by the analyzer (<0 chunk size)`,
                            );
                            return;
                        }
                        chunkSize = [_chunkSize, 0, 0];
                    } else {
                        chunkSize = _chunkSize;
                    }

                    // Calculate slice boundaries including context window
                    // start: cursor - prefetch (but not before array start)
                    // end: cursor + chunk + postfetch (but not past array end)
                    const start = Math.max(cursor - chunkSize[1], 0);
                    const end = Math.min(cursor + chunkSize[0] + chunkSize[2], filtered.length);
                    const currents = filtered.slice(start, end);
                    const isFirst = cursor === 0; // First chunk may need special handling
                    logger.debug(
                        `[${dataset.name}] Processing block ${start}-${end} (${currents.length} subunits)`,
                    );

                    // Attempt to process the chunk
                    try {
                        // action returns cursor adjustment (usually 0, negative if LLM skipped items)
                        cursorRelative = await action(currents, cursor - start, isFirst, tries, i);
                        logger.debug(
                            `[${dataset.name}] Cursor relative movement: ${cursorRelative}`,
                        );

                        // Sanity check: Ensure at least one item was processed
                        if (chunkSize[0] + cursorRelative <= 0) {
                            throw new Error("Failed to process any subunits");
                        }

                        // Update progress tracking
                        session.expectedItems += chunkSize[0];
                        session.finishedItems += chunkSize[0] + cursorRelative;
                        if (cursorRelative !== 0) {
                            logger.debug(
                                `[${dataset.name}}] Expected ${chunkSize[0]} subunits, processed ${chunkSize[0] + cursorRelative} subunits`,
                            );
                        }
                        break; // Success - exit retry loop
                    } catch (e) {
                        ++tries;
                        const error = new Analyzer.InternalError(
                            `Analysis error, try ${tries}/${retries}`,
                        );
                        error.cause = e;
                        if (tries >= retries) {
                            throw error; // All retries exhausted
                        }
                        // Mark chunk as processed (even though it failed) to avoid infinite loop
                        session.expectedItems += chunkSize[0];
                        session.finishedItems += chunkSize[0];
                        logger.error(error, true);
                    }
                }
                // Advance cursor: move by chunk size + any adjustment from parseResponse
                cursor += chunkSize[0] + cursorRelative;
            }

            // Execute optional post-iteration callback (e.g., save intermediate results)
            await onIterate?.(i);

            logger.info(`[${dataset.name}] Iteration ${i + 1}/${analyzer.maxIterations} completed`);
        }
    });
