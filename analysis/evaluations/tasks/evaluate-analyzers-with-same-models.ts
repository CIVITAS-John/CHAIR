import * as File from 'fs';
import { GetMessagesPath } from "../../../utils/loader.js";
import { CoverageEvaluator } from "../codebook-coverage-evaluator.js";
import { BuildReferenceAndEvaluateCodebooks } from "../codebooks.js";
import { InitializeEmbeddings } from '../../../utils/embeddings.js';
import { EnsureFolder } from '../../../utils/llms.js';

InitializeEmbeddings("gecko-768-similarity");

/** EvaluateAnalyzers: Evaluate the performance of different analyzers using the same model. */
async function EvaluateAnalyzers(SourcePath: string, Dataset: string, LLM: string, Analyzers: string[]) {
    var ReferencePath = SourcePath + "/evaluation/references";
    EnsureFolder(ReferencePath);
    var TargetPath = SourcePath + "/evaluation/results/" + LLM;
    EnsureFolder(TargetPath);
    // Build the paths
    var Paths = Analyzers.map(Analyzer => SourcePath + "/" + Analyzer + " / " + Dataset + "-" + LLM + ".json");
    // Build the reference and evaluate the codebooks
    var Results = await BuildReferenceAndEvaluateCodebooks(
        Paths, ReferencePath + "/" + LLM, new CoverageEvaluator(), TargetPath);
    File.writeFileSync(TargetPath + ".json", JSON.stringify(Results, null, 4));
}

await EvaluateAnalyzers(GetMessagesPath("Users of Physics Lab (Group 1)", "Conversations"), "0~17-gpt-3.5-turbo", "llama3-70b", ["high-level-1", "high-level-2", "low-level-3"]);