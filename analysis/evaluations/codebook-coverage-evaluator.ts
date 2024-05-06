import { EvaluateTexts } from "../../utils/embeddings.js";
import { Code, Codebook, CodebookEvaluation } from "../../utils/schema.js";
import { CodebookEvaluator } from './codebooks.js';

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
        // Then, we combine the codes from each codebook and record the ownership
        // We use the reference code as the baseline if multiple codes are found
        // Here, the reference codebook's first definition will be used (will need to change)
        // Then, we calculate the name overlapping of each code (a very rough metric)
        var Evaluations: CodebookEvaluation[] = [];
        var Codes: Map<string, Code> = new Map();
        var Owners: Map<string, number[]> = new Map();
        var Alternatives: Map<string, string> = new Map();
        for (var [Index, Codebook] of Codebooks.entries()) {
            Evaluations.push({ Count: Object.keys(Codebook).length, Overlap: 0 });
            for (var [Label, Code] of Object.entries(Codebook)) {
                var NewLabel = Label;
                if (Index == 0)
                    Code.Alternatives?.forEach(Alternative => Alternatives.set(Alternative, Label));
                else if (Alternatives.has(Label)) 
                    NewLabel = Alternatives.get(Label)!;
                if (!Codes.has(NewLabel)) {
                    Codes.set(NewLabel, Code);
                    if (Index != 0) debugger;
                }
                if (!Owners.has(NewLabel)) Owners.set(NewLabel, []);
                if (!Owners.get(NewLabel)!.includes(Index))
                    Owners.get(NewLabel)!.push(Index);
                Evaluations[Index].Overlap += 1;
            }
        }
        // Then, we convert each code into an embedding and send to Python
        var Labels = Array.from(Codes.values()).map(Code => Code.Label);
        var CodeStrings = Labels.map(Label => GetCodeString(Codes.get(Label)!));
        var CodeOwners = Labels.map(Label => Owners.get(Label)!);
        var Result = await EvaluateTexts(CodeStrings, Labels, CodeOwners, Names, this.Name, "coverage", this.Visualize.toString());
        for (var Key of Object.keys(Result)) {
            var Index = parseInt(Key);
            var Evaluation = Result[Index];
            Object.assign(Evaluations[Index], Evaluation);
        }
        // Return in the format
        var Results: Record<string, CodebookEvaluation> = {};
        for (var [Index, Name] of Names.entries())
            Results[Name] = Evaluations[Index];
        return Results;
    }
}

/** GetCodeString: Get the strings of the codes. */
export function GetCodeString(Code: Code): string {
    var Text = `Label: ${Code.Label}`;
    if ((Code.Definitions?.length ?? 0) > 0) Text += `\nDefinition: ${Code.Definitions![0]}`;
    return Text;
}