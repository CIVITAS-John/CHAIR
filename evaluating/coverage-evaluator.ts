import { EvaluateTexts } from "../utils/embeddings.js";
import { Code, Codebook, CodebookEvaluation } from "../utils/schema.js";
import { MergeCodebooks } from "../consolidating/codebooks.js";
import { CodebookEvaluator } from "./codebooks.js";

/** CoverageEvaluator: An evaluator of codebook coverage against a reference codebook (#0). */
export class CoverageEvaluator extends CodebookEvaluator {
    /** Name: The name of the evaluator. */
    public Name: string = "coverage-evaluator";
    /** Visualize: Whether we visualize the evaluation. */
    public Visualize: boolean = false;
    /** Evaluate: Evaluate a number of codebooks. */
    public async Evaluate(Codebooks: Codebook[], Names: string[], ExportPath?: string): Promise<Record<string, CodebookEvaluation>> {
        // We treat the first input as the reference codebook
        Names[0] = "baseline";
        var Evaluations: CodebookEvaluation[] = [];
        var Merged = MergeCodebooks(Codebooks, true);
        // Then, we convert each code into an embedding and send to Python
        var Labels = Object.values(Merged).map((Code) => Code.Label);
        var CodeStrings = Labels.map((Label) => GetCodeString(Merged[Label]!));
        var CodeOwners = Labels.map((Label) => Merged[Label]!.Owners!);
        var Result = await EvaluateTexts<Record<number, CodebookEvaluation>>(
            CodeStrings,
            Labels,
            CodeOwners,
            Names,
            this.Name,
            "coverage",
            this.Visualize.toString(),
            ExportPath ?? "./known",
        );
        for (var Key of Object.keys(Result)) {
            var Index = parseInt(Key);
            Evaluations[Index] = Result[Index];
        }
        // Return in the format
        var Results: Record<string, CodebookEvaluation> = {};
        for (var [Index, Name] of Names.entries()) Results[Name] = Evaluations[Index];
        return Results;
    }
}

/** GetCodeString: Get the strings of the codes. */
export function GetCodeString(Code: Code): string {
    var Text = `Label: ${Code.Label}`;
    if ((Code.Definitions?.length ?? 0) > 0) Text += `\nDefinition: ${Code.Definitions![0]}`;
    return Text;
}
