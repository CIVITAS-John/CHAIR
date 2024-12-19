import type { Code, Codebook, DataChunk, DataItem } from "../../../utils/schema.js";

/** FindConsolidatedCode: Find a consolidated code by name. */
export function FindConsolidatedCode(Consolidated: Codebook, Name: string) {
    return Object.values(Consolidated).find((Code) => Code.Label == Name || Code.Alternatives?.includes(Name));
}

/** GetConsolidatedSize: Get the size of the consolidated codebook. */
export function GetConsolidatedSize(Baseline: Codebook, Codebook: Codebook) {
    return new Set(
        Object.keys(Codebook)
            .map((Code) => FindConsolidatedCode(Baseline, Code)?.Label)
            .map((Code) => Code),
    ).size;
}

/** ExtractExamples: Extract examples from a code. */
export function ExtractExamples(Examples: string[]): Map<string, string[]> {
    const Results = new Map<string, string[]>();
    const Scores = new Map<string, number>();
    // Extract the examples
    for (const Example of Examples) {
        const Index = Example.indexOf("|||");
        if (Index != -1) {
            var Quote = Example.substring(Index + 3);
            const ID = Example.substring(0, Index);
            if (!Results.has(Quote)) {
                Results.set(Quote, []);
            }
            Results.get(Quote)!.push(ID);
        } else {
            if (!Results.has(Example)) {
                Results.set(Example, []);
            }
            Results.get(Example)!.push("");
        }
    }
    // Calculate the score
    for (var [Quote, IDs] of Results) {
        Scores.set(Quote, Quote.length * IDs.length);
    }
    // Sort by the score
    const NewResults = new Map<string, string[]>();
    Array.from(Scores.keys())
        .sort((A, B) => Scores.get(B)! - Scores.get(A)!)
        .forEach((Key) => {
            NewResults.set(Key, Results.get(Key)!);
        });
    return NewResults;
}

/** FindOriginalCodes: Find the original codes from an owner. */
export function FindOriginalCodes(Codebook: Codebook, Source: Code, Owner: number, Example?: string): Code[] {
    let Codes = Object.values(Codebook);
    Codes = Codes.filter((Code) => Source.Label == Code.Label || Source.Alternatives?.includes(Code.Label));
    if (Example) {
        Codes = Codes.filter((Code) => Code.Examples?.includes(Example) || Code.Examples?.some((Current) => Current.startsWith(`${Example}|||`)));
    }
    return Codes;
}

/** FindExampleSources: Find the original sources of an example from an owner. */
export function FindExampleSources(Codebook: Codebook, Source: Code, Example: string, Owner: number): Code[] {
    const Codes = FindOriginalCodes(Codebook, Source, Owner);
    const SoftMatch = `|||${Example}`;
    return Codes.filter((Code) => Code.Examples?.findIndex((Current) => Current == Example || Current.endsWith(SoftMatch)) != -1);
}

/** GetChunks: Get the chunks from the sources. */
export function GetChunks(Sources: Record<string, Record<string, DataChunk<DataItem>>>): DataChunk<DataItem>[] {
    return Object.values(Sources).flatMap((Source) => Object.values(Source));
}

/** GetItems: Get the items from the sources. */
export function GetItems(Sources: Record<string, Record<string, DataChunk<DataItem>>>): DataItem[] {
    return GetChunks(Sources).flatMap((Chunk) => Chunk.AllItems ?? []);
}

/** GetItems: Get the items from a source. */
export function GetItemsFromDataset(Sources: Record<string, DataChunk<DataItem>>): DataItem[] {
    return Object.values(Sources).flatMap((Chunk) => Chunk.AllItems ?? []);
}
