/**
 * Code Consolidator Module
 *
 * This module provides the foundational classes for consolidating qualitative codes after initial analysis.
 * It implements a pipeline-based architecture where multiple consolidators can be chained together
 * to progressively refine, merge, and organize codes from raw analysis results.
 *
 * Key responsibilities:
 * - Merging duplicate or similar codes based on various strategies
 * - Generating and refining code definitions using LLM assistance
 * - Managing iterative consolidation with loop control and early stopping
 * - Orchestrating multiple consolidators in a sequential pipeline
 * - Filtering and chunking codes for efficient processing
 *
 * Architecture:
 * - CodeConsolidator: Abstract base class defining the consolidation interface
 * - CodebookConsolidator: Specialized consolidator for generating codebooks from analysis units
 * - PipelineConsolidator: Orchestrates multiple consolidators in sequence with state management
 *
 * @module consolidating/consolidator
 */

import { Analyzer } from "../analyzer.js";
import type { Code, Codebook, CodedThreads, CodedThreadsWithCodebook } from "../schema.js";
import { logger } from "../utils/core/logger.js";
import { seededShuffle } from "../utils/core/misc.js";

/**
 * Base error class for consolidator-related errors
 */
abstract class ConsolidatorError extends Error {
    override name = "Consolidator.Error";
    constructor(message: string, source?: string) {
        super(`${source ? `${source}: ` : ""}${message}`);
    }
}

/**
 * Abstract base class for code consolidators.
 *
 * This class defines the contract for all consolidators that process and refine qualitative codes.
 * It provides a template method pattern with hooks for filtering, preprocessing, prompt building,
 * response parsing, and postprocessing.
 *
 * Consolidation Workflow:
 * 1. Filter codes using subunitFilter() - exclude already processed codes
 * 2. Preprocess remaining codes with preprocess() - prepare for LLM processing
 * 3. Build prompts with buildPrompts() - create system/user messages for LLM
 * 4. Parse LLM response with parseResponse() - extract and apply code updates
 * 5. Postprocess with postprocess() - final cleanup (remove merged codes, etc.)
 *
 * Loop Control Mechanism:
 * - looping: Set to true to enable iterative processing until stopping condition
 * - stopping: Set to true within preprocess() to signal completion of iterations
 * - Example: SimpleMerger sets stopping=true when no codes were merged
 *
 * State Management:
 * - Consolidators maintain state across iterations via instance variables
 * - The codebook is updated in-place and passed through the pipeline
 * - Codes marked with "[Merged]" label are removed in postprocess()
 */
export abstract class CodeConsolidator {
    static Error = ConsolidatorError;

    /** Error thrown when LLM response doesn't match expected format */
    static InvalidResponseError = class extends ConsolidatorError {
        override name = "Analyzer.InvalidResponseError";
    };

    /** Get a prefixed logger for consistent log formatting */
    protected abstract get _prefix(): string;

    /**
     * Whether to process codes in chunks (true) or all at once (false)
     * When true, codes are processed in batches determined by getChunkSize()
     */
    chunkified = false;

    /**
     * Flag indicating if consolidation should continue iterating
     * Set to true to enable repeated processing until stopping condition is met
     */
    looping = false;

    /**
     * Flag to signal early termination of consolidation loop
     * Set to true within preprocess() or parseResponse() to stop iterations
     */
    stopping = false;

    /** The name of the consolidator (defaults to class name) */
    get name(): string {
        return this.constructor.name;
    }

    /**
     * Filter codes before processing
     *
     * This hook allows consolidators to exclude certain codes from processing.
     * Common use cases:
     * - Exclude codes already marked as "[Merged]"
     * - Skip codes without definitions (for definition-dependent consolidators)
     * - Filter codes that don't meet specific criteria
     *
     * @param _code - The code to evaluate for inclusion
     * @returns true to include the code in processing, false to skip it
     */
    subunitFilter(_code: Code): boolean {
        return true;
    }

    /**
     * Preprocess codes after filtering but before chunking
     *
     * This is the main hook for non-LLM consolidation logic (e.g., clustering-based merging).
     * Can modify codes in-place or return a completely new codebook.
     *
     * Typical implementations:
     * - SimpleMerger: Clusters codes by label similarity and merges clusters
     * - RefineMerger: Clusters codes by definition similarity for LLM refinement
     * - Sets stopping flag when no more work is needed
     *
     * @param _codebook - Current state of the codebook
     * @param subunits - Filtered codes to process
     * @returns Modified codes array OR updated codebook object
     */
    preprocess(_codebook: Codebook, subunits: Code[]): Promise<Code[] | Codebook> {
        return Promise.resolve(subunits);
    }

    /**
     * Build prompts for LLM to process codes
     *
     * Return values determine whether LLM is invoked:
     * - Codebook only: No LLM call, just update codebook state
     * - [system, user]: LLM called with these prompts
     * - [system, user, codebook]: LLM called + codebook updated before parsing
     *
     * Empty strings ["", ""] signal to skip LLM processing for this chunk.
     *
     * @param codebook - Current codebook state
     * @param _codes - Codes in current chunk to process
     * @returns Codebook update OR prompt pair OR prompt pair + codebook
     */
    buildPrompts(
        codebook: Codebook,
        _codes: Code[],
    ): Promise<Codebook | [string, string] | [string, string, Codebook]> {
        return Promise.resolve(codebook);
    }

    /**
     * Parse LLM response and update codebook/codes
     *
     * Extracts structured information from LLM response lines and applies updates.
     * Typical parsing logic:
     * - Extract code definitions, labels, categories from formatted response
     * - Update code objects with new information
     * - Merge codes if label changes indicate duplicates
     *
     * Cursor Movement Return Value:
     * - Positive number: Successfully processed N codes, advance cursor
     * - Zero: Processed but don't advance (for retries or special cases)
     * - Negative: Error or completion signal
     *
     * @param _codebook - Codebook to update
     * @param _codes - Codes being processed in this chunk
     * @param _lines - LLM response split into lines
     * @returns Cursor movement OR [cursor movement, updated codebook]
     */
    parseResponse(
        _codebook: Codebook,
        _codes: Code[],
        _lines: string[],
    ): Promise<number | [number, Codebook]> {
        return Promise.resolve(0);
    }

    /**
     * Final cleanup after all consolidation iterations complete
     *
     * Default behavior: Remove all codes marked as "[Merged]"
     * These are codes that were merged into other codes during processing.
     *
     * Can be overridden for additional cleanup:
     * - Logging statistics about merged codes
     * - Final validation of code structure
     * - Removing temporary fields (like oldLabels)
     *
     * @param subunits - All codes after consolidation
     * @returns Cleaned codes array
     */
    postprocess(subunits: Code[]): Promise<Code[]> {
        return Promise.resolve(subunits.filter((Code) => Code.label !== "[Merged]"));
    }

    /**
     * Determine chunk size for processing codes
     *
     * Chunking Strategy:
     * - Non-chunkified: Process all remaining codes at once
     * - Chunkified: Process in batches, reducing size on retries
     *
     * Retry Logic:
     * - Each retry reduces chunk size by 25% of recommended size
     * - Minimum chunk size is 1 to ensure progress
     * - Helps recover from LLM errors or token limit issues
     *
     * @param recommended - Recommended chunk size from analyzer
     * @param remaining - Total codes remaining to process
     * @param tries - Number of retry attempts for current chunk
     * @returns Actual chunk size to use
     */
    getChunkSize(recommended: number, remaining: number, tries: number) {
        return this.chunkified
            ? Math.max(recommended - tries * Math.ceil(recommended / 4), 1)
            : remaining;
    }
}

/**
 * Abstract base for consolidators that generate codebooks
 *
 * This specialized analyzer processes arrays of data units and produces coded threads.
 * Used for consolidators that need to operate at the dataset level rather than
 * individual code level.
 *
 * @template TUnit - Type of data units being processed (e.g., DataChunk<DataItem>)
 */
export abstract class CodebookConsolidator<TUnit> extends Analyzer<TUnit[], Code, CodedThreads> {
    static ConfigError = class extends CodebookConsolidator.Error {
        override name = "CodebookConsolidator.ConfigError";
    };
}

/**
 * Orchestrates multiple consolidators in sequence to refine codes
 *
 * The PipelineConsolidator executes an ordered sequence of CodeConsolidators,
 * passing the codebook through each stage for progressive refinement.
 *
 * Pipeline Execution Flow:
 * 1. Initialize with index = -1
 * 2. For each iteration:
 *    a. Advance index when previous consolidator completes
 *    b. If looping=true, check stopping flag before advancing
 *    c. Execute current consolidator's lifecycle methods
 *    d. Update codebook with results
 * 3. Finalize when all consolidators complete
 *
 * State Transitions:
 * - index=-1: Initial state, waiting to start first consolidator
 * - index=0..N-1: Processing consolidator at index
 * - index>=N: All consolidators complete, finalize codebook
 *
 * Looping Control:
 * - Non-looping consolidators: Run once, then advance
 * - Looping consolidators: Repeat until stopping=true or no codes remain
 * - stopping flag reset after each consolidator completes
 *
 * Codebook Updates:
 * - Each consolidator can modify codebook in preprocess/parseResponse
 * - Changes propagate to next consolidator in pipeline
 * - Final codebook assembled from remaining non-merged codes
 *
 * @template TUnit - Type of source data units
 */
export class PipelineConsolidator<TUnit> extends Analyzer<TUnit[], Code, CodedThreadsWithCodebook> {
    /** The name of the consolidator */
    override name = "consolidated";
    /** Temperature for LLM responses (0.5 for balanced creativity/consistency) */
    override baseTemperature = 0.5;
    /** Max iterations allowed (65536 is effectively unlimited) */
    override maxIterations = 65536;
    /** Current position in the consolidator pipeline (-1 = not started) */
    #index = -1;
    /** Ordered list of consolidators to execute sequentially */
    #consolidators: CodeConsolidator[];

    override get _prefix() {
        return logger.prefixed(logger.prefix, `PipelineConsolidator#${this.#index}`);
    }

    constructor(consolidators: CodeConsolidator[]) {
        super();
        this.#consolidators = consolidators;
    }

    /**
     * Delegate chunk size calculation to current consolidator
     *
     * Returns -1 when pipeline is complete to signal termination.
     *
     * @param recommended - Recommended chunk size
     * @param remaining - Codes remaining to process
     * @param _iteration - Current iteration number (unused)
     * @param tries - Retry attempts for current chunk
     * @returns Chunk size for current consolidator, or -1 if pipeline complete
     */
    override getChunkSize(
        recommended: number,
        remaining: number,
        _iteration: number,
        tries: number,
    ) {
        if (this.#index >= this.#consolidators.length) {
            return -1;
        }
        return this.#consolidators[this.#index].getChunkSize(recommended, remaining, tries);
    }

    /**
     * Preprocess codes and manage pipeline state transitions
     *
     * This method orchestrates the pipeline by:
     * 1. Checking if current consolidator should advance (based on looping/stopping)
     * 2. Calling postprocess on completed consolidator
     * 3. Advancing index to next consolidator
     * 4. Shuffling codes to prevent over-merging bias
     * 5. Calling preprocess on new consolidator
     * 6. Updating codebook with results
     *
     * State Management Details:
     * - Looping consolidators: Only advance when stopping=true or no codes remain
     * - Non-looping: Advance immediately after each iteration
     * - stopping flag reset after advancing
     * - Empty array returned when pipeline complete to halt processing
     *
     * Codebook Assembly:
     * - When pipeline completes (index >= length), convert codes to codebook
     * - Return empty array to signal completion
     *
     * @param analysis - Contains codebook being built
     * @param _data - Source data units (unused in consolidation)
     * @param subunits - Current codes to process
     * @param iteration - Current iteration number
     * @returns Preprocessed codes for next consolidator, or empty array if complete
     */
    override preprocess(
        analysis: CodedThreadsWithCodebook,
        _data: TUnit[],
        subunits: Code[],
        iteration: number,
    ): Promise<Code[]> {
        return logger.withSource(this._prefix, "preprocess", async () => {
            // Pipeline complete - finalize codebook
            if (this.#index >= this.#consolidators.length) {
                return [];
            }

            // Decide whether to advance to next consolidator
            if (this.#index > -1 && this.#consolidators[this.#index].looping) {
                // Looping consolidator: only advance if stopping or no codes left
                if (this.#consolidators[this.#index].stopping || subunits.length === 0) {
                    subunits =
                        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                        (await this.#consolidators[this.#index]?.postprocess(subunits)) ?? subunits;
                    this.#consolidators[this.#index].stopping = false;
                    this.#index++;
                }
                // Otherwise, keep current consolidator and iterate again
            } else {
                // Non-looping consolidator: always advance after postprocess
                subunits =
                    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
                    (await this.#consolidators[this.#index]?.postprocess(subunits)) ?? subunits;
                this.#index++;
            }

            // Check again if pipeline complete after advancing
            if (this.#index >= this.#consolidators.length) {
                // Convert final codes to codebook and return empty to stop processing
                analysis.codebook = Object.fromEntries(subunits.map((Code) => [Code.label, Code]));
                return [];
            }

            // Log consolidator start
            logger.info(
                `Iteration ${iteration}: ${this.#consolidators[this.#index].name}, started with ${subunits.length} codes`,
            );

            // Shuffle codes with fixed seed to prevent positional bias in merging
            // This ensures different codes get paired together across iterations
            subunits = seededShuffle(subunits, 0);

            // Execute current consolidator's preprocess
            const res = await this.#consolidators[this.#index].preprocess(
                analysis.codebook,
                subunits,
            );

            // Handle return value: either Code[] or Codebook
            if (Array.isArray(res)) {
                // Code[] returned: rebuild codebook from array
                analysis.codebook = Object.fromEntries(res.map((Code) => [Code.label, Code]));
                return res;
            }
            // Codebook returned: use it directly and extract codes
            analysis.codebook = res;
            return Object.values(res);
        });
    }

    /**
     * Delegate code filtering to current consolidator
     *
     * @param code - Code to filter
     * @param _iteration - Current iteration (unused)
     * @returns true to include code, false to skip
     */
    override subunitFilter(code: Code, _iteration: number): boolean {
        if (this.#index >= this.#consolidators.length) {
            return false;
        }
        return this.#consolidators[this.#index].subunitFilter(code);
    }

    /**
     * Delegate prompt building to current consolidator
     *
     * Handles three return types from consolidator:
     * 1. Codebook only: Updates codebook, returns empty prompts (no LLM call)
     * 2. [system, user]: Returns prompts for LLM
     * 3. [system, user, codebook]: Updates codebook and returns prompts
     *
     * Returns ["", ""] when stopping to skip LLM processing.
     *
     * @param analysis - Contains codebook being updated
     * @param _data - Source data (unused)
     * @param codes - Codes in current chunk
     * @param _chunkStart - Starting position (unused)
     * @param _iteration - Current iteration (unused)
     * @returns [system prompt, user prompt] for LLM, or ["", ""] to skip
     */
    override async buildPrompts(
        analysis: CodedThreadsWithCodebook,
        _data: TUnit[],
        codes: Code[],
        _contexts: Code[],
        _chunkStart: number,
        _iteration: number,
    ): Promise<[string, string]> {
        if (
            this.#index >= this.#consolidators.length ||
            this.#consolidators[this.#index].stopping
        ) {
            return ["", ""];
        }

        const prompts = await this.#consolidators[this.#index].buildPrompts(
            analysis.codebook,
            codes,
        );
        if (Array.isArray(prompts)) {
            if (prompts.length === 2) {
                return prompts;
            }
            // Three-element array: update codebook and return prompts
            analysis.codebook = prompts[2];
            return [prompts[0], prompts[1]];
        }
        // Codebook only: update it and signal no LLM call needed
        analysis.codebook = prompts;
        return ["", ""];
    }

    /**
     * Delegate response parsing to current consolidator
     *
     * @param analysis - Contains codebook to update
     * @param lines - LLM response lines
     * @param codes - Codes being processed
     * @param _chunkStart - Starting position (unused)
     * @param _iteration - Current iteration (unused)
     * @returns Cursor movement (-1 to stop, 0 to retry, positive to advance)
     */
    override async parseResponse(
        analysis: CodedThreadsWithCodebook,
        lines: string[],
        codes: Code[],
        _chunkStart: number,
        _iteration: number,
    ): Promise<number> {
        if (
            this.#index >= this.#consolidators.length ||
            this.#consolidators[this.#index].stopping
        ) {
            return -1;
        }
        const res = await this.#consolidators[this.#index].parseResponse(
            analysis.codebook,
            codes,
            lines,
        );
        if (Array.isArray(res)) {
            // [cursor, codebook] pair returned
            analysis.codebook = res[1];
            return res[0];
        }
        // Just cursor returned
        return res;
    }
}
