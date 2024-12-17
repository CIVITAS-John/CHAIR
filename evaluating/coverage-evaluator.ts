import { MergeCodebooks } from "../consolidating/codebooks.js";
import { EvaluateTexts } from "../utils/embeddings.js";
import { Code, Codebook, CodebookEvaluation } from "../utils/schema.js";

import { CodebookEvaluator } from "./codebooks.js";

/** CoverageEvaluator: An evaluator of codebook coverage against a reference codebook (#0). */
export class CoverageEvaluator extends CodebookEvaluator {
    /** Name: The name of the evaluator. */
    public Name = "coverage-evaluator";
    /** Visualize: Whether we visualize the evaluation. */
    public Visualize = false;
    /** Evaluate: Evaluate a number of codebooks. */
    public async Evaluate(Codebooks: Codebook[], Names: string[], ExportPath?: string): Promise<Record<string, CodebookEvaluation>> {
        // We treat the first input as the reference codebook
        Names[0] = "baseline";
        const Evaluations: CodebookEvaluation[] = [];
        const Merged = MergeCodebooks(Codebooks, true);
        // Then, we convert each code into an embedding and send to Python
        const Labels = Object.values(Merged).map((Code) => Code.Label);
        const CodeStrings = Labels.map((Label) => GetCodeString(Merged[Label]));
        const CodeOwners = Labels.map((Label) => Merged[Label].Owners ?? []);
        const Result = await EvaluateTexts<Record<number, CodebookEvaluation>>(
            CodeStrings,
            Labels,
            CodeOwners,
            Names,
            this.Name,
            "coverage",
            this.Visualize.toString(),
            ExportPath ?? "./known",
        );
        for (const Key of Object.keys(Result)) {
            const Index = parseInt(Key);
            Evaluations[Index] = Result[Index];
        }
        // Return in the format
        const Results: Record<string, CodebookEvaluation> = {};
        for (const [Index, Name] of Names.entries()) {
            Results[Name] = Evaluations[Index];
        }
        return Results;
    }
}

/** GetCodeString: Get the strings of the codes. */
export function GetCodeString(Code: Code): string {
    let Text = `Label: ${Code.Label}`;
    if ((Code.Definitions?.length ?? 0) > 0) {
        Text += `\nDefinition: ${Code.Definitions?.[0]}`;
    }
    return Text;
}
