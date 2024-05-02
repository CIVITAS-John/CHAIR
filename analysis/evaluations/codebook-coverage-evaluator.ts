import { ClusterTexts } from "../../utils/embeddings.js";
import { Code, Codebook } from "../../utils/schema.js";
import { CodebookEvaluator } from './codebooks.js';

/** CoverageEvaluator: An evaluator of codebook coverage. */
export class CoverageEvaluator extends CodebookEvaluator {
    /** Name: The name of the evaluator. */
    public Name: string = "coverage-evaluator";
    /** Evaluate: Evaluate a number of codebooks. */
    public async Evaluate(Codebooks: Codebook[], Names: string[]): Promise<void> {
        var AllCodes: Code[] = [];
        var AllLabels: string[] = [];
        var AllOwners: number[] = [];
        // Get all the codes
        for (var I = 0; I < Codebooks.length; I++) {
            var Codebook = Codebooks[I];
            var Codes = Object.values(Codebook).filter(Code => (Code.Examples?.length ?? 0) > 1);
            var Labels = Codes.map(Code => Code.Label);
            AllCodes.push(...Codes); 
            AllLabels.push(...Labels.map(Label => `${I}/${Label}`));
            AllOwners.push(...Labels.map(Label => I));
        }
        // Visualize them
        var CodeStrings = AllCodes.map(GetCodeString);
        await ClusterTexts(CodeStrings, AllLabels, "evaluator", "show-density");
    }
}

/** GetCodeString: Get the  */
export function GetCodeString(Code: Code): string {
    return Code.Label;
    // var Text = `Label: ${Code.Label}`;
    // if ((Code.Definitions?.length ?? 0) > 0) Text += `\nDefinition: ${Code.Definitions![0]}`;
    // return Text;
}