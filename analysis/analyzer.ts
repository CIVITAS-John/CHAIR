import { CodedThread, Message } from "../utils/schema";

/** Analyzer: The definition of an abstract analyzer. */
export abstract class Analyzer<T> {
    /** Name: The name of the analyzer. */
    public Name: string = "Unnamed";
    /** GetChunkSize: Get the chunk configuration for the LLM. */
    // Return value: Chunk size; or [Chunk size, Prefetch, Postfetch]
    // return Recommended: the default behavior, use the recommended chunk size (ideal for coding individual messages);
    // return 1: each message will be its own chunk (not recommended for the lack of context);
    // return [1, 1, 1]: each message will be its own chunk, and the LLM will receive the previous and next messages as well;
    // return Remaining: all remaining messages will be in the same chunk (ideal for coding the entire conversation). 
    // For example, for an output of [1, 1, 1], `BuildPrompts` would receive `Messages` 1 (Prefetch), 2, and 3 (Postfetch). `Start` will be 1 because that's the first message in the chunk.
    public GetChunkSize(Recommended: number, Remaining: number): number | [number, number, number] {
        return Recommended;
    }
    /** BuildPrompts: Build the prompts for the LLM. */
    public abstract BuildPrompts(Target: T, Analysis: CodedThread, Messages: Message[], ChunkStart: number, LastChunk: boolean): [string, string];
    /** ParseResponse: Parse the responses from the LLM. */
    public abstract ParseResponse(Lines: string[], Analysis: CodedThread, Messages: Message[], ChunkStart: number, LastChunk: boolean): Record<number, string>;
}