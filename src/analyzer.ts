import { BaseStep } from "./steps/base-step.js";
import { logger } from "./utils/logger.js";

abstract class AnalyzerError extends Error {
    override name = "Analyzer.Error";
    constructor(message: string, source?: string) {
        super(`${source ? `${source}: ` : ""}${message}`);
    }
}

/** The definition of an abstract analyzer. */
export abstract class Analyzer<TUnit, TSubunit, TAnalysis> {
    static Error = AnalyzerError;

    static InvalidResponseError = class extends AnalyzerError {
        override name = "Analyzer.InvalidResponseError";
    };
    static InternalError = class extends AnalyzerError {
        override name = "Analyzer.InternalError";
    };

    protected get _prefix() {
        return logger.prefixed(logger.prefix, this.name);
    }

    /** The name of the analyzer. */
    name = "Unnamed";
    /** The suffix of the analyzer. */
    suffix = "";
    /** The base temperature for the LLM. */
    baseTemperature = 0;
    /** The maximum number of iterations for the analyzer. */
    maxIterations = 1;

    /**
     * Get the chunk configuration for the LLM.
     * Return value: Chunk size; or [Chunk size, Prefetch, Postfetch]
     * return recommended: the default behavior, use the recommended chunk size (ideal for coding individual subunits);
     * return 1: each subunit will be its own chunk (not recommended for the lack of context);
     * return [1, 1, 1]: each subunit will be its own chunk, and the LLM will receive the previous and next subunits as well;
     * return remaining: all remaining subunits will be in the same chunk (ideal for coding the entire conversation).
     * For example, for an output of [1, 1, 1], `buildPrompts` would receive `subunits` 0 (Prefetch), 1, and 2 (Postfetch). `chunkStart` will be 1 because that's the first message in the chunk.
     */
    getChunkSize(
        recommended: number,
        _remaining: number,
        _iteration: number,
        _tries: number,
    ): number | [number, number, number] {
        return recommended;
    }
    /** Preprocess the units at the very beginning. */
    async batchPreprocess(_units: TUnit[], _analyzed: TAnalysis[]): Promise<void> {
        // This method is intentionally left empty
    }
    /** Preprocess the subunits before filtering and chunking. */
    async preprocess(
        _analysis: TAnalysis,
        _source: TUnit,
        subunits: TSubunit[],
        _iteration: number,
    ): Promise<TSubunit[]> {
        return await Promise.resolve(subunits);
    }
    /** Filter the subunits before chunking. */
    subunitFilter(_Subunit: TSubunit, _Iteration: number): boolean {
        return true;
    }
    /**
     * Build the prompts for the LLM.
     * Note that the `chunkStart` index starts from 0, which could be confusing because in our example, the first message in the prompt is 1 (with index=0).
     * `chunkStart` is particularly useful if you want to code just 1 message but also include the context of the previous and next subunits.
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
     * Parse the responses from the LLM.
     * The return value is only for item-based coding, where each item has its own response. Otherwise, return `{}`.
     * Alternatively, it can return a number to indicate the relative cursor movement. (Actual units - Expected units, often negative.)
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

/** Process data through the analyzer in a chunkified way. */
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
        const { dataset, session } = BaseStep.Context.get();
        if (!session) {
            throw new BaseStep.ContextVarNotFoundError("session");
        }

        // Split units into smaller chunks based on the maximum items
        for (let i = 0; i < analyzer.maxIterations; i++) {
            // Preprocess and filter the subunits
            sources = await analyzer.preprocess(analysis, source, sources, i);
            if (sources.length === 0) {
                continue;
            }
            logger.info(`[${dataset.name}] Iteration ${i + 1}/${analyzer.maxIterations}`);
            let cursor = 0;
            const filtered = sources.filter((subunit) => analyzer.subunitFilter(subunit, i));
            logger.info(`[${dataset.name}] ${filtered.length} subunits filtered`);
            // Loop through the subunits
            while (cursor < filtered.length) {
                logger.debug(`[${dataset.name}] Cursor at ${cursor}/${filtered.length}`);
                let tries = 0;
                let cursorRelative = 0;
                let chunkSize = [0, 0, 0];
                while (tries < retries) {
                    // Get the chunk size
                    const _chunkSize = analyzer.getChunkSize(
                        Math.min(session.llm.maxItems, filtered.length - cursor),
                        filtered.length - cursor,
                        i,
                        tries,
                    );
                    logger.debug(`[${dataset.name}] Chunk size: ${JSON.stringify(_chunkSize)}`);
                    if (typeof _chunkSize === "number") {
                        if (_chunkSize < 0) {
                            logger.warn(
                                `[${dataset.name}] Stopped iteration due to signals sent by the analyzer (<0 chunk size)`,
                            );
                            return;
                        }
                        chunkSize = [_chunkSize, 0, 0];
                    } else {
                        chunkSize = _chunkSize;
                    }

                    // Get the chunk
                    const start = Math.max(cursor - chunkSize[1], 0);
                    const end = Math.min(cursor + chunkSize[0] + chunkSize[2], filtered.length);
                    const currents = filtered.slice(start, end);
                    const isFirst = cursor === 0;
                    logger.debug(
                        `[${dataset.name}] Processing block ${start}-${end} (${currents.length} subunits)`,
                    );
                    // Run the prompts
                    try {
                        cursorRelative = await action(currents, cursor - start, isFirst, tries, i);
                        logger.debug(
                            `[${dataset.name}] Cursor relative movement: ${cursorRelative}`,
                        );
                        // Sometimes, the action may return a relative cursor movement
                        if (chunkSize[0] + cursorRelative <= 0) {
                            throw new Error("Failed to process any subunits");
                        }
                        session.expectedItems += chunkSize[0];
                        session.finishedItems += chunkSize[0] + cursorRelative;
                        if (cursorRelative !== 0) {
                            logger.debug(
                                `[${dataset.name}}] Expected ${chunkSize[0]} subunits, processed ${chunkSize[0] + cursorRelative} subunits`,
                            );
                        }
                        break;
                    } catch (e) {
                        ++tries;
                        const error = new Analyzer.InternalError(
                            `Analysis error, try ${tries}/${retries}`,
                        );
                        error.cause = e;
                        if (tries >= retries) {
                            throw error;
                        }
                        session.expectedItems += chunkSize[0];
                        session.finishedItems += chunkSize[0];
                        logger.error(error, true);
                    }
                }
                // Move the cursor
                cursor += chunkSize[0] + cursorRelative;
            }
            // Run the iteration function
            await onIterate?.(i);

            logger.info(`[${dataset.name}] Iteration ${i + 1}/${analyzer.maxIterations} completed`);
        }
    });
