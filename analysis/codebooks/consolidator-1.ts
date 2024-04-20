import { Code, CodedThread, CodedThreads, Conversation, Message } from '../../utils/schema.js';
import { CodebookConsolidator } from './codebooks.js';

/** Consolidator1: Consolidate a codebook through generating definitions for codes, then cluster them using text embeddings. */
export class Consolidator1<TUnit> extends CodebookConsolidator<TUnit> {
    /** Name: The name of the analyzer. */
    public Name: string = "consolidator-1";
    /** BaseTemperature: The base temperature for the LLM. */
    public BaseTemperature: number = 0;
    /** GetChunkSize: Get the chunk size and cursor movement for the LLM. */
    // Return value: [Chunk size, Cursor movement]
    public GetChunkSize(Recommended: number, Remaining: number) {
        return Remaining;
    }
    /** GetStep: Get the next step for the current analysis. */
    private GetStep(Analysis: CodedThreads): number {
        var Codes = Object.values(Analysis.Codebook!);
        // 0: Generate definitions for codes
        // If there are no codes or no definitions, generate definitions
        if (Codes[0].Definitions?.length ?? 0 == 0) return 0;
        // 1: Cluster codes using text embeddings
        // If there are multiple categories for a code, cluster them
        if (Codes.findIndex(Code => (Code.Categories?.length ?? 0) != 1) != -1) return 1;
        // -1: Done
        return -1;
    }
    /** BuildPrompts: Build the prompts for the LLM. */
    public BuildPrompts(Analysis: CodedThreads, Data: TUnit[], Codes: Code[], ChunkStart: number): [string, string] {
        var Step = this.GetStep(Analysis);
        switch (Step) {
            case 0:
                return [``.trim(), Codes.map(Code => Code).join("\n")];
            default:
                return ["", ""];
        }
    }
    /** ParseResponse: Parse the responses from the LLM. */
    public ParseResponse(Analysis: CodedThreads, Lines: string[], Codes: Code[], ChunkStart: number): Record<number, string> {
        throw new Error('Method not implemented.');
    }
}