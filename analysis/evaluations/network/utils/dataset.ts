import { Cash } from "cash-dom";
import { Code, Codebook, Dataset } from "../../../../utils/schema";

/** ExtractExamples: Extract examples from a code. */
export function ExtractExamples(Examples: string[]): Map<string, string[]> {
    var Results = new Map<string, string[]>();
    var Scores = new Map<string, number>();
    // Extract the examples
    for (var Example of Examples) {
        var Index = Example.indexOf("|||");
        if (Index != -1) {
            var Quote = Example.substring(Index + 3);
            var ID = Example.substring(0, Index);
            if (!Results.has(Quote)) Results.set(Quote, []);
            Results.get(Quote)!.push(ID);
        } else {
            if (!Results.has(Example)) Results.set(Example, []);
            Results.get(Example)!.push("");
        }
    }
    // Calculate the score
    for (var [Quote, IDs] of Results) {
        Scores.set(Quote, Quote.length * IDs.length);
    }
    // Sort by the score
    var NewResults: Map<string, string[]> = new Map();
    Array.from(Scores.keys()).sort((A, B) => Scores.get(B)! - Scores.get(A)!).forEach(Key => {
        NewResults.set(Key, Results.get(Key)!);
    });
    return NewResults;
}
/** FindOriginalCodes: Find the original codes from an owner. */
export function FindOriginalCodes(Codebook: Codebook, Source: Code, Owner: number): Code[] {
    var Codes = Object.values(Codebook);
    return Codes.filter(Code => Source.Label == Code.Label || Source.Alternatives?.includes(Code.Label));
}

/** FindExampleSources: Find the original sources of an example from an owner. */
export function FindExampleSources(Codebook: Codebook, Source: Code, Example: string, Owner: number): Code[] {
    var Codes = FindOriginalCodes(Codebook, Source, Owner);
    var SoftMatch = `|||${Example}`;
    return Codes.filter(Code => Code.Examples?.findIndex(Current => Current == Example || Current.endsWith(SoftMatch)) != -1);
}