import chalk from "chalk";

import { Analyzer } from "../analyzer.js";
import { Shuffle } from "../utils/math.js";
import { Code, Codebook, CodedThreads } from "../utils/schema.js";

/** CodebookConsolidator: The definition of an abstract codebook consolidator. */
export abstract class CodebookConsolidator<TUnit> extends Analyzer<TUnit[], Code, CodedThreads> {}

/** PipelineConsolidator: A pipeline consolidator that runs through multiple CodeConsolidator. */
export class PipelineConsolidator<TUnit> extends Analyzer<TUnit[], Code, CodedThreads> {
    /** Name: The name of the analyzer. */
    public Name = "consolidated";
    /** BaseTemperature: The base temperature for the LLM. */
    public BaseTemperature = 0.5;
    /** MaxIterations: The maximum number of iterations for the analyzer. */
    public MaxIterations = 65536;
    /** Consolidators: The list of consolidators in the pipeline. */
    private Consolidators: CodeConsolidator[];
    /** Index: The current consolidator index in the pipeline. */
    private Index = -1;
    /** Constructor: Create a new PipelineConsolidator. */
    constructor(...Consolidators: CodeConsolidator[]) {
        super();
        this.Consolidators = Consolidators;
    }
    /** GetChunkSize: Get the chunk size and cursor movement for the LLM. */
    // Return value: [Chunk size, Cursor movement]
    public GetChunkSize(Recommended: number, Remaining: number, _Iteration: number, Tries: number) {
        if (this.Index >= this.Consolidators.length) {
            return -1;
        }
        return this.Consolidators[this.Index].GetChunkSize(Recommended, Remaining, Tries);
    }
    /** Preprocess: Preprocess the subunits before filtering and chunking. */
    public async Preprocess(Analysis: CodedThreads, _Data: TUnit[], Subunits: Code[], Iteration: number): Promise<Code[]> {
        if (!Analysis.Codebook) {
            throw new Error("Analysis does not have a summarized codebook.");
        }
        if (this.Index >= this.Consolidators.length) {
            return [];
        }
        if (this.Index > -1 && this.Consolidators[this.Index].Looping) {
            // If the previous consolidator is looping, check if it's stopping
            if (this.Consolidators[this.Index].Stopping || Subunits.length === 0) {
                this.Consolidators[this.Index].Stopping = false;
                this.Index++;
            }
            // Otherwise, advance the index
        } else {
            this.Index++;
        }
        if (this.Index >= this.Consolidators.length) {
            return [];
        }
        console.log(chalk.white(chalk.bold(`Iteration ${Iteration}: ${this.Consolidators[this.Index].GetName()}`)));
        // Preprocess the subunits
        Subunits = Subunits.filter((Code) => Code.Label !== "[Merged]");
        // Reorder the subunits to prevent over-merging
        Subunits = Shuffle(Subunits, 0);
        const Result = await this.Consolidators[this.Index].Preprocess(Analysis.Codebook, Subunits);
        if (Result instanceof Array) {
            return Result;
        }
        Analysis.Codebook = Result;
        return Object.values(Result);
    }
    /** SubunitFilter: Filter the subunits before chunking. */
    public SubunitFilter(Code: Code, _Iteration: number): boolean {
        if (this.Index >= this.Consolidators.length) {
            return false;
        }
        return this.Consolidators[this.Index].SubunitFilter(Code);
    }
    /** BuildPrompts: Build the prompts for the LLM. */
    public async BuildPrompts(
        Analysis: CodedThreads,
        _Data: TUnit[],
        Codes: Code[],
        _ChunkStart: number,
        _Iteration: number,
    ): Promise<[string, string]> {
        if (!Analysis.Codebook) {
            throw new Error("Analysis does not have a summarized codebook.");
        }
        if (this.Index >= this.Consolidators.length || this.Consolidators[this.Index].Stopping) {
            return ["", ""];
        }
        const Prompts = await this.Consolidators[this.Index].BuildPrompts(Analysis.Codebook, Codes);
        if (Prompts instanceof Array) {
            if (Prompts.length === 2) {
                return Prompts;
            }
            Analysis.Codebook = Prompts[2];
            return [Prompts[0], Prompts[1]];
        }
        Analysis.Codebook = Prompts;
        return ["", ""];
    }
    /** ParseResponse: Parse the responses from the LLM. */
    public async ParseResponse(Analysis: CodedThreads, Lines: string[], Codes: Code[], _ChunkStart: number, _Iteration: number): Promise<number> {
        if (!Analysis.Codebook) {
            throw new Error("Analysis does not have a summarized codebook.");
        }
        if (this.Index >= this.Consolidators.length || this.Consolidators[this.Index].Stopping) {
            return -1;
        }
        const Result = await this.Consolidators[this.Index].ParseResponse(Analysis.Codebook, Codes, Lines);
        if (Result instanceof Array) {
            Analysis.Codebook = Result[1];
            return Result[0];
        }
        return Result;
    }
}

/** CodeConsolidator: The definition of an abstract code consolidator. */
export abstract class CodeConsolidator {
    /** Chunckified: Whether the consolidator needs chunkified results. */
    public Chunkified = false;
    /** Looping: Whether the consolidator is looping. */
    public Looping = false;
    /** Stopping: Whether the consolidator is stopping. */
    public Stopping = false;
    /** GetName: Get the name of the consolidator. */
    public GetName(): string {
        return this.constructor.name;
    }
    /** SubunitFilter: Filter the subunits before chunking. */
    public SubunitFilter(_Code: Code): boolean {
        return true;
    }
    /** Preprocess: Preprocess the subunits after filtering, before chunking. */
    public Preprocess(_Codebook: Codebook, Subunits: Code[]): Promise<Code[] | Codebook> {
        return Promise.resolve(Subunits);
    }
    /** BuildPrompts: Build the prompts for the code consolidator. */
    public BuildPrompts(Codebook: Codebook, _Codes: Code[]): Promise<Codebook | [string, string] | [string, string, Codebook]> {
        return Promise.resolve(Codebook);
    }
    /** ParseResponse: Parse the response for the code consolidator. */
    public ParseResponse(_Codebook: Codebook, _Codes: Code[], _Lines: string[]): Promise<number | [number, Codebook]> {
        return Promise.resolve(0);
    }
    /** GetChunkSize: Get the chunk size and cursor movement for the LLM. */
    // Return value: [Chunk size, Cursor movement]
    public GetChunkSize(Recommended: number, Remaining: number, Tries: number) {
        return this.Chunkified ? Math.max(Recommended - Tries * Math.ceil(Recommended / 4), 1) : Remaining;
    }
}
