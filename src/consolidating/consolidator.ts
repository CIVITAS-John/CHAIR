import { Analyzer } from "../analyzer.js";
import type { Code, Codebook, CodedThreads, CodedThreadsWithCodebook, Dataset } from "../schema.js";
import type { IDStrFunc } from "../steps/base-step.js";
import type { LLMSession } from "../utils/llms.js";
import { logger } from "../utils/logger.js";
import { seededShuffle } from "../utils/misc.js";

/** An abstract code consolidator. */
export abstract class CodeConsolidator {
    protected abstract _idStr: IDStrFunc;

    /** Whether the consolidator needs chunkified results. */
    chunkified = false;
    /** Whether the consolidator is looping. */
    looping = false;
    /** Whether the consolidator is stopping. */
    stopping = false;
    /** The name of the consolidator. */
    get name(): string {
        return this.constructor.name;
    }

    /** Filter the subunits before chunking. */
    subunitFilter(_code: Code): boolean {
        return true;
    }

    /** Preprocess the subunits after filtering, before chunking. */
    preprocess(_codebook: Codebook, subunits: Code[]): Promise<Code[] | Codebook> {
        return Promise.resolve(subunits);
    }

    /** Build the prompts for the code consolidator. */
    buildPrompts(
        codebook: Codebook,
        _codes: Code[],
    ): Promise<Codebook | [string, string] | [string, string, Codebook]> {
        return Promise.resolve(codebook);
    }

    /** Parse the response for the code consolidator. */
    parseResponse(
        _codebook: Codebook,
        _codes: Code[],
        _lines: string[],
    ): Promise<number | [number, Codebook]> {
        return Promise.resolve(0);
    }

    /**
     * Get the chunk size and cursor movement for the LLM.
     * @returns [Chunk size, Cursor movement]
     */
    getChunkSize(recommended: number, remaining: number, tries: number) {
        return this.chunkified
            ? Math.max(recommended - tries * Math.ceil(recommended / 4), 1)
            : remaining;
    }
}

/** An abstract codebook consolidator. */
// ESLint does not recognize type parameters in array
// See https://typescript-eslint.io/rules/no-unnecessary-type-parameters/#limitations

export abstract class CodebookConsolidator<TUnit> extends Analyzer<TUnit[], Code, CodedThreads> {
    static ConfigError = class extends CodebookConsolidator.Error {
        override name = "CodebookConsolidator.ConfigError";
    };
}

/** A pipeline consolidator that runs through multiple CodeConsolidator. */
export class PipelineConsolidator<TUnit> extends Analyzer<TUnit[], Code, CodedThreadsWithCodebook> {
    /** The name of the consolidator. */
    override name = "consolidated";
    /** The base temperature for the LLM. */
    override baseTemperature = 0.5;
    /** The maximum number of iterations for the consolidator. */
    override maxIterations = 65536;
    /** The current consolidator index in the pipeline. */
    #index = -1;
    /** The list of consolidators in the pipeline. */
    #consolidators: CodeConsolidator[];

    constructor(
        idStr: IDStrFunc,
        /** The dataset the consolidator is working on. */
        public override dataset: Dataset<TUnit[]>,
        /** The LLM session for the consolidator. */
        public override session: LLMSession,
        consolidators: CodeConsolidator[],
    ) {
        super(idStr, dataset, session);
        this._idStr = (mtd?: string) => idStr(`PipelineConsolidator${mtd ? `#${mtd}` : ""}`);
        this.#consolidators = consolidators;
    }

    /**
     * Get the chunk size and cursor movement for the LLM.
     * @returns [Chunk size, Cursor movement]
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

    /** Preprocess the subunits before filtering and chunking. */
    override async preprocess(
        analysis: CodedThreadsWithCodebook,
        _data: TUnit[],
        subunits: Code[],
        iteration: number,
    ): Promise<Code[]> {
        const _id = this._idStr("preprocess");

        if (this.#index >= this.#consolidators.length) {
            return [];
        }

        if (this.#index > -1 && this.#consolidators[this.#index].looping) {
            // If the previous consolidator is looping, check if it's stopping
            if (this.#consolidators[this.#index].stopping || subunits.length === 0) {
                this.#consolidators[this.#index].stopping = false;
                this.#index++;
            }
            // Otherwise, advance the index
        } else {
            this.#index++;
        }
        if (this.#index >= this.#consolidators.length) {
            return [];
        }

        logger.info(`Iteration ${iteration}: ${this.#consolidators[this.#index].name}`, _id);

        // Preprocess the subunits
        subunits = subunits.filter((Code) => Code.label !== "[Merged]");
        // Reorder the subunits to prevent over-merging
        subunits = seededShuffle(subunits, 0);

        const res = await this.#consolidators[this.#index].preprocess(analysis.codebook, subunits);
        if (Array.isArray(res)) {
            return res;
        }
        analysis.codebook = res;
        return Object.values(res);
    }

    /** Filter the subunits before chunking. */
    override subunitFilter(code: Code, _iteration: number): boolean {
        if (this.#index >= this.#consolidators.length) {
            return false;
        }
        return this.#consolidators[this.#index].subunitFilter(code);
    }

    /** Build the prompts for the LLM. */
    override async buildPrompts(
        analysis: CodedThreadsWithCodebook,
        _data: TUnit[],
        codes: Code[],
        _chunkStart: number,
        _iteration: number,
    ): Promise<[string, string]> {
        const _id = this._idStr("buildPrompts");

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
            analysis.codebook = prompts[2];
            return [prompts[0], prompts[1]];
        }
        analysis.codebook = prompts;
        return ["", ""];
    }
    
    /** Parse the responses from the LLM. */
    override async parseResponse(
        analysis: CodedThreadsWithCodebook,
        lines: string[],
        codes: Code[],
        _chunkStart: number,
        _iteration: number,
    ): Promise<number> {
        const _id = this._idStr("parseResponse");

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
            analysis.codebook = res[1];
            return res[0];
        }
        return res;
    }
}
