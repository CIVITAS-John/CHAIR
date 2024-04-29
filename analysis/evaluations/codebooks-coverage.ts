import { Code, Codebook } from "../../utils/schema.js";
import { CodebookEvaluator } from './codebooks.js';

/** CoverageEvaluator: An evaluator of codebook coverage. */
export class CoverageEvaluator extends CodebookEvaluator {
    /** Evaluate: Evaluate a number of codebooks. */
    public async Evaluate(Codebooks: Codebook[], Names: string[]): Promise<void> {
        for (var Codebook in Codebooks) {
            // Build the code strings
            var Codes = Object.values(Codebooks[Codebook]);
            var CodeStrings = Codes.map(Code => {
                var Text = `Label: ${Code.Label}`;
                if ((Code.Definitions?.length ?? 0) > 0) Text += `\nDefinition: ${Code.Definitions![0]}`;
            });
            // Evaluate the codebook
        }
    }
}