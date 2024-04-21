import { RequestEmbeddingWithCache } from '../../utils/embeddings.js';
import { Code, CodedThreads } from '../../utils/schema.js';
import { CodebookConsolidator } from './codebooks.js';

/** Consolidator1: Consolidate a codebook through generating definitions for codes, then cluster them using text embeddings. */
export class Consolidator1<TUnit> extends CodebookConsolidator<TUnit> {
    /** Name: The name of the analyzer. */
    public Name: string = "consolidator-1";
    /** BaseTemperature: The base temperature for the LLM. */
    public BaseTemperature: number = 0;
    /** MaxIterations: The maximum number of iterations for the analyzer. */
    public MaxIterations: number = 2;
    /** GetChunkSize: Get the chunk size and cursor movement for the LLM. */
    // Return value: [Chunk size, Cursor movement]
    public GetChunkSize(Recommended: number, Remaining: number, Iteration: number) {
        switch (Iteration) {
            case 0:
                return Recommended;
            case 1:
                return Remaining;
            default: 
                return -1;
        }
    }
    /** BuildPrompts: Build the prompts for the LLM. */
    public BuildPrompts(Analysis: CodedThreads, Data: TUnit[], Codes: Code[], ChunkStart: number, Iteration: number): [string, string] {
        switch (Iteration) {
            // 0: Generate definitions for codes
            case 0:
                // If there are no codes without definitions, skip this step
                if (Codes.findIndex(Code => (Code.Definitions?.length ?? 0) == 0) == -1) return ["", ""];
                Codes = Codes.filter(Code => (Code.Definitions?.length ?? 0) == 0);
                return [`
You are an expert in thematic analysis.
You are writing short, clear, generalizable definitions for each code based on example quotes.
Example quotes are independent of each other. Do not include the name or examples in the definition.
Always follow the output format for all ${Codes.length} codes:
---
1. {Definition of code 1}
...
${Codes.length}. {Definition of code ${Codes.length}}
---`.trim(), 
                    Codes.map((Code, Index) => `
${Index + 1}. ${Code.Label}. Quotes:
${Code.Examples?.sort((A, B) => B.length - A.length).slice(0, 3).map(Example => `- ${Example}`).join("\n")}`.trim()).join("\n\n")];
            case 1:
                // 1: Cluster codes using text embeddings
                // If all codes have exactly one category, skip this step
                if (Codes.findIndex(Code => (Code.Categories?.length ?? 0) != 1) == -1) return ["", ""];
                Codes = Codes.filter(Code => (Code.Definitions?.length ?? 0) > 0);
                // Combine each code into a string for clustering
                var CodeStrings = Codes.map(Code => {
                    var Text = `Label: ${Code.Label}`;
                    if ((Code.Categories?.length ?? 0) > 0) Text += `\nCategories: \n- ${Code.Categories!.join("\n")}`;
                    if ((Code.Definitions?.length ?? 0) > 0) Text += `\nDefinitions: \n- ${Code.Definitions!.join("\n")}`;
                    if ((Code.Examples?.length ?? 0) > 0) Text += `\nExamples: \n- ${Code.Examples!.join("\n")}`;
                    return Text;
                });
                var Embeddings = CodeStrings.map(Text => RequestEmbeddingWithCache(Text, this.Name));
                // This step does not involve any prompts
                return ["", ""];
            default:
                return ["", ""];
        }
    }
    /** ParseResponse: Parse the responses from the LLM. */
    public ParseResponse(Analysis: CodedThreads, Lines: string[], Codes: Code[], ChunkStart: number, Iteration: number): Record<number, string> {
        switch (Iteration) {
            case 0:
                // 0: Generate definitions for codes
                var Results: string[] = [];
                Codes = Codes.filter(Code => (Code.Definitions?.length ?? 0) == 0);
                // Parse the definitions
                for (var I = 0; I < Lines.length; I++) {
                    var Match = Lines[I].match(/^(\d+)\. (.*)$/);
                    if (Match) {
                        var Definition = Match[2];
                        // Sometimes the LLM will return "{code}: {definition}"
                        if (Definition.match(/^[\w ]+\: /)) Definition = Definition.substring(Definition.indexOf(":") + 1).trim();
                        Results[parseInt(Match[1]) - 1] = Definition;
                    }
                }
                // Check if the response is valid
                if (Results.length != Codes.length) 
                    throw new Error(`Invalid response: ${Results.length} results for ${Codes.length} inputs`);
                // Update the codes
                for (var I = 0; I < Codes.length; I++) {
                    Codes[I].Definitions = [Results[I]];
                }
                break;
        }
        return {};
    }
}