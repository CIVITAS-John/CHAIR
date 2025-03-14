import type { Dataset } from "./schema";
import type { LLMSession } from "./utils/llms";

abstract class AnalyzerError extends Error {
    name = "Analyzer.Error";
}

/** The definition of an abstract analyzer. */
export abstract class Analyzer<TUnit, TSubunit, TAnalysis> {
    static Error = AnalyzerError;
    static InternalError = class extends Analyzer.Error {
        name = "Analyzer.InternalError";
    };
    static ConfigError = class extends Analyzer.Error {
        name = "Analyzer.ConfigError";
    };
    static InvalidResponseError = class extends Analyzer.Error {
        name = "Analyzer.InvalidResponseError";
    };

    /** The name of the analyzer. */
    name = "Unnamed";
    /** The suffix of the analyzer. */
    suffix = "";
    /** The base temperature for the LLM. */
    baseTemperature = 0;
    /** The maximum number of iterations for the analyzer. */
    maxIterations = 1;
    /** The dataset the analyzer is working on. */
    dataset: Dataset<TUnit>;
    /** The LLM session for the analyzer. */
    session: LLMSession;

    constructor(dataset: Dataset<TUnit>, session: LLMSession) {
        this.dataset = dataset;
        this.session = session;
    }

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
     * The return value is only for item-based coding, where each item has its own response. Otherwise, return {}.
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
