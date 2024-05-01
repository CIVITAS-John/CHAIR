import { CountItems, MaxItems } from "../utils/llms.js";

/** Analyzer: The definition of an abstract analyzer. */
export abstract class Analyzer<TUnit, TSubunit, TAnalysis> {
    /** Name: The name of the analyzer. */
    public Name: string = "Unnamed";
    /** BaseTemperature: The base temperature for the LLM. */
    public BaseTemperature: number = 0;
    /** MaxIterations: The maximum number of iterations for the analyzer. */
    public MaxIterations: number = 1;
    /** GetChunkSize: Get the chunk configuration for the LLM. */
    // Return value: Chunk size; or [Chunk size, Prefetch, Postfetch]
    // return Recommended: the default behavior, use the recommended chunk size (ideal for coding individual subunits);
    // return 1: each subunit will be its own chunk (not recommended for the lack of context);
    // return [1, 1, 1]: each subunit will be its own chunk, and the LLM will receive the previous and next subunits as well;
    // return Remaining: all remaining subunits will be in the same chunk (ideal for coding the entire conversation). 
    // For example, for an output of [1, 1, 1], `BuildPrompts` would receive `subunits` 0 (Prefetch), 1, and 2 (Postfetch). `ChunkStart` will be 1 because that's the first message in the chunk.
    public GetChunkSize(Recommended: number, Remaining: number, Iteration: number, Tries: number): number | [number, number, number] {
        return Recommended;
    }
    /** Preprocess: Preprocess the subunits before filtering and chunking. */
    public async Preprocess(Analysis: TAnalysis, Source: TUnit, Subunits: TSubunit[], Iteration: number): Promise<TSubunit[]> { return Subunits; }
    /** SubunitFilter: Filter the subunits before chunking. */
    public SubunitFilter(Subunit: TSubunit, Iteration: number): boolean { return true; }
    /** BuildPrompts: Build the prompts for the LLM. */
    // Note that the `ChunkStart` index starts from 0, which could be confusing because in our example, the first message in the prompt is 1 (with index=0).
    // `ChunkStart` is particularly useful if you want to code just 1 message but also include the context of the previous and next subunits.
    public abstract BuildPrompts(Analysis: TAnalysis, Source: TUnit, Subunits: TSubunit[], ChunkStart: number, Iteration: number): Promise<[string, string]>;
    /** ParseResponse: Parse the responses from the LLM. */
    // The return value is only for item-based coding, where each item has its own response. Otherwise, return {}.
    // Alternatively, it can return a number to indicate the relative cursor movement. (Actual units - Expected units, often negative.)
    public abstract ParseResponse(Analysis: TAnalysis, Lines: string[], Subunits: TSubunit[], ChunkStart: number, Iteration: number): Promise<Record<number, string> | number>;
}

/** LoopThroughChunks: Process data through the analyzer in a chunkified way. */
export async function LoopThroughChunks<TUnit, TSubunit, TAnalysis>(
    Analyzer: Analyzer<TUnit, TSubunit, TAnalysis>, Analysis: TAnalysis, Source: TUnit, Sources: TSubunit[], 
    Action: (Currents: TSubunit[], ChunkStart: number, IsFirst: boolean, Tries: number, Iteration: number) => Promise<number>, 
    Iteration: (Iteration: number) => Promise<void> = async () => { }) {
    // Split units into smaller chunks based on the maximum items
    for (var I = 0; I < Analyzer.MaxIterations; I++) {
        var Cursor = 0;
        // Preprocess and filter the subunits
        Sources = await Analyzer.Preprocess(Analysis, Source, Sources, I);
        if (Sources.length == 0) continue;
        var Filtered = Sources.filter(Subunit => Analyzer.SubunitFilter(Subunit, I));
        // Loop through the subunits
        while (Cursor < Filtered.length) {
            var Tries = 0; var CursorRelative = 0;
            while (true) {
                // Get the chunk size
                var ChunkSize = Analyzer.GetChunkSize(Math.min(MaxItems, Filtered.length - Cursor), Filtered.length - Cursor, I, Tries);
                if (typeof ChunkSize == "number") {
                    if (ChunkSize < 0) {
                        console.log("Stopped iterating due to signals sent by the analyzer (<0 chunk size).");
                        return;
                    }
                    ChunkSize = [ChunkSize, 0, 0];
                }
                // Get the chunk
                var Start = Math.max(Cursor - ChunkSize[1], 0);
                var End = Math.min(Cursor + ChunkSize[0] + ChunkSize[2], Filtered.length);
                var Currents = Filtered.slice(Start, End);
                var IsFirst = Cursor == 0;
                // Run the prompts
                try {
                    CursorRelative = await Action(Currents, Cursor - Start, IsFirst, Tries, I);
                    // Sometimes, the action may return a relative cursor movement
                    if (ChunkSize[0] + CursorRelative <= 0) throw new Error("Failed to process any subunits.");
                    CountItems(ChunkSize[0], ChunkSize[0] + CursorRelative);
                    if (CursorRelative != 0)
                        console.log(`Expected ${ChunkSize[0]} subunits, processed ${ChunkSize[0] + CursorRelative} subunits.`);
                    break;
                } catch (Error: any) {
                    if (++Tries > 3) throw Error;
                    CountItems(ChunkSize[0], 0);
                    console.log(`Analysis error, retrying ${Tries} times:\n${Error.message}\n${Error.stack}`);
                }
            }
            // Move the cursor
            Cursor += ChunkSize[0] + CursorRelative;
        }
        // Run the iteration function
        await Iteration(I);
    }
}