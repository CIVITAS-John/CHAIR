import chalk from "chalk";

import type { Code, Codebook } from "../utils/schema.js";

import { MergeCodes } from "./codebooks.js";
import { CodeConsolidator } from "./consolidator.js";

/** AlternativeMerger: Merge codes based on already merged results. */
// In this pass, we will find codes that have been merged and merge them again.
// Not used: while this reduces the number of codes, it also introduce errors.
export class AlternativeMerger extends CodeConsolidator {
    /** Preprocess: In this case, we do not really use the LLM, so we just merge the codes. */
    public async Preprocess(Codebook: Codebook, Codes: Code[]) {
        const Result: Record<string, Code> = {};
        const Alternatives = new Map<string, Code[]>();
        // Record the alternatives
        Codes.forEach((Code) => {
            Code.Alternatives?.forEach((Alternative) => {
                if (!Alternatives.has(Alternative)) {
                    Alternatives.set(Alternative, []);
                }
                Alternatives.get(Alternative)!.push(Code);
            });
        });
        // Find the best alternatives
        const BestAlternatives = new Map<string, Code>();
        Alternatives.forEach((Alternatives, Name) => {
            const Length = Alternatives.length;
            if (Length == 1) {
                BestAlternatives.set(Name, Codes[0]);
            } else {
                // Maybe we should change to distance instead of examples
                const Best = Alternatives.sort(
                    (A, B) => (B.Examples?.length ?? 0) - (A.Examples?.length ?? 0),
                )[0];
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
        console.log(
            chalk.green(
                `Statistics: Codes merged from ${Object.keys(Codebook).length} to ${Object.keys(Result).length}`,
            ),
        );
        return Result;
    }
}
