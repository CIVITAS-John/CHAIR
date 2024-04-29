import * as File from 'fs';
import * as Path from 'path';
import { Codebook } from "../../utils/schema.js";
import { GetFilesRecursively } from '../../utils/file.js';

/** CodebookEvaluator: An evaluator of codebook. */
export abstract class CodebookEvaluator {
    /** Name: The name of the evaluator. */
    public Name: string = "Unnamed";
    /** Evaluate: Evaluate a number of codebooks. */
    public abstract Evaluate(Codebooks: Codebook[], Names: string[]): Promise<void>;
}

/** EvaluateCodebooks: Evaluate a number of codebooks under the same folder. */
export async function EvaluateCodebooks(Source: string, Evaluator: CodebookEvaluator) {
    var Codebooks: Codebook[] = [];
    var Names: string[] = [];
    // Find all the codebooks under the path
    for (var Current of GetFilesRecursively(Source)) {
        if (Current.endsWith(".json")) {
            var Content = File.readFileSync(`${Current}`, 'utf8');
            var Parsed = JSON.parse(Content);
            if (Parsed.Codebook) {
                console.log(`Loading ${Current} as coded threads.`)
                Codebooks.push(Parsed.Codebook);
            } else if (!Parsed.Threads) {
                console.log(`Loading ${Current} as a codebook.`)
                Codebooks.push(Parsed);
            } else {
                console.log(`Skipping ${Current} because it is not a codebook.`);
                continue;
            }
            Names.push(Path.basename(Current));
        }
    }
    console.log(`Statistics: Loaded ${Codebooks.length} codebooks.`);
    // Evaluate the codebooks
    await Evaluator.Evaluate(Codebooks, Names);
}