import * as File from 'fs';
import { EvaluateTexts } from "../../utils/embeddings.js";
import { Code, Codebook, CodebookComparison, CodebookEvaluation } from "../../utils/schema.js";
import { MergeCodebooks } from "../codebooks/codebooks.js";
import { CodebookEvaluator } from './codebooks.js';
import { CreateServer } from '../../utils/server.js';
import { ReadOrBuildCache } from '../../utils/file.js';
import md5 from 'md5';

/** NetworkEvaluator: A network evaluator of codebook against a reference codebook (#0) with potential human inputs. */
export class NetworkEvaluator extends CodebookEvaluator {
    /** Name: The name of the evaluator. */
    public Name: string = "network-evaluator";
    /** Visualize: Whether we visualize the evaluation. */
    public Visualize: boolean = false;
    /** Evaluate: Evaluate a number of codebooks. */
    public async Evaluate(Codebooks: Codebook[], Names: string[], ExportPath?: string): Promise<Record<string, CodebookEvaluation>> {
        var Hash = md5(JSON.stringify(Codebooks));
        // Build the network information
        var Package = await ReadOrBuildCache(ExportPath + "/network", Hash, async () => {
            // We treat the first input as the reference codebook
            Names[0] = "baseline";
            var Merged = MergeCodebooks(Codebooks, true);
            // Then, we convert each code into an embedding and send to Python
            var Codes = Object.values(Merged);
            var Labels = Codes.map(Code => Code.Label);
            var CodeStrings = Labels.map(Label => GetCodeString(Merged[Label]!));
            var CodeOwners = Labels.map(Label => Merged[Label]!.Owners!);
            var Result = await EvaluateTexts<{Distances: number[][], Positions: [number, number][]}>
                (CodeStrings, Labels, CodeOwners, Names, this.Name, 
                    "network", this.Visualize.toString(), ExportPath ?? "./known");
            // Infuse the results back into the reference codebook
            for (var I = 0; I < Codes.length; I++) {
                Codes[I].Position = Result.Positions[I];
            }
            // Return in the format
            var Package: CodebookComparison = {
                Codebooks: Codebooks,
                Names: Names,
                Codes: Codes,
                Distances: Result.Distances
            };
            return Package;
        });
        // Run the HTTP server
        await CreateServer(8080, "analysis/evaluations/network",
            "./out/analysis/evaluations/network/visualizer.js", 
            "./out/analysis/evaluations/network/side-panel.js", 
            "./out/analysis/evaluations/network/info-panel.js", 
            ExportPath + "/network.json");
        // Return in the format
        var Results: Record<string, CodebookEvaluation> = {};
        return Results;
    }
}

/** GetCodeString: Get the strings of the codes. */
export function GetCodeString(Code: Code): string {
    var Text = `Label: ${Code.Label}`;
    if ((Code.Definitions?.length ?? 0) > 0) Text += `\nDefinition: ${Code.Definitions![0]}`;
    return Text;
}