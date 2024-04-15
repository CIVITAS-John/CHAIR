import { CodedThread, Message } from "../utils/schema";

/** Analyzer: The definition of an abstract analyzer. */
export interface Analyzer<T> {
    /** Name: The name of the analyzer. */
    Name: string;
    /** BuildPrompts: Build the prompts for the LLM. */
    BuildPrompts(Target: T, Analysis: CodedThread, Messages: Message[], LastChunk: boolean): [string, string];
    /** ParseResponse: Parse the responses from the LLM. */
    ParseResponse(Lines: string[], Analysis: CodedThread, Messages: Message[]): Record<number, string>;
}