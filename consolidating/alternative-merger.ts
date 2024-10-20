import chalk from "chalk";
import { Codebook, Code } from "../utils/schema.js";
import { MergeCodes } from "./codebooks.js";
import { CodeConsolidator } from "./consolidator.js";

/** AlternativeMerger: Merge codes based on already merged results. */
// In this pass, we will find codes that have been merged and merge them again.
// Not used: while this reduces the number of codes, it also introduce errors.
export class AlternativeMerger extends CodeConsolidator {
    /** Preprocess: In this case, we do not really use the LLM, so we just merge the codes. */
    public async Preprocess(Codebook: Codebook, Codes: Code[]) {
        var Result: Record<string, Code> = {};
        var Alternatives: Map<string, Code[]> = new Map();
        // Record the alternatives
        Codes.forEach((Code) => {
            Code.Alternatives?.forEach((Alternative) => {
                if (!Alternatives.has(Alternative)) Alternatives.set(Alternative, []);
                Alternatives.get(Alternative)!.push(Code);
            });
        });
        // Find the best alternatives
        var BestAlternatives: Map<string, Code> = new Map();
        Alternatives.forEach((Alternatives, Name) => {
            var Length = Alternatives.length;
            if (Length == 1) BestAlternatives.set(Name, Codes[0]);
            else {
                // Maybe we should change to distance instead of examples
                var Best = Alternatives.sort((A, B) => (B.Examples?.length ?? 0) - (A.Examples?.length ?? 0))[0];
                BestAlternatives.set(Name, Best);
            }
        });
        // Remove alternatives from the codebook
        Codes.forEach((Code) => (Code.Alternatives = []));
        // Merge the codes
        Codes.forEach((Code) => {
            if ((Code.Alternatives?.length ?? 0) > 0 || !BestAlternatives.has(Code.Label)) {
                Result[Code.Label] = Code;
            } else {
                MergeCodes(BestAlternatives.get(Code.Label)!, Code);
            }
        });
        console.log(chalk.green(`Statistics: Codes merged from ${Object.keys(Codebook).length} to ${Object.keys(Result).length}`));
        return Result;
    }
}
