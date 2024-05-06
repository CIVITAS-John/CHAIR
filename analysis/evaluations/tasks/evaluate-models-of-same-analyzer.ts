import * as File from 'fs';
import { GetMessagesPath } from "../../../utils/loader.js";
import { CoverageEvaluator } from "../codebook-coverage-evaluator.js";
import { BuildReferenceAndEvaluateCodebooks } from "../codebooks.js";
import { InitializeEmbeddings } from '../../../utils/embeddings.js';
import { EnsureFolder } from '../../../utils/llms.js';

InitializeEmbeddings("gecko-768-similarity");

/** EvaluateWithinAnalyzer: Evaluate the performance of a codebook within the analyzer. */
async function EvaluateWithinAnalyzer(SourcePath: string, Analyzer: string) {
    /* Example Task: Compare the performance between models using high-level-1 analyzer. */
    var ReferencePath = SourcePath + "/evaluation/references";
    EnsureFolder(ReferencePath);
    var TargetPath = SourcePath + "/evaluation/results/" + Analyzer;
    EnsureFolder(TargetPath);
    
    // Build the reference and evaluate the codebooks
    var Results = await BuildReferenceAndEvaluateCodebooks(
        [SourcePath + "/" + Analyzer], ReferencePath + "/" + Analyzer, new CoverageEvaluator(), TargetPath);
    File.writeFileSync(TargetPath + ".json", JSON.stringify(Results, null, 4));
}

await EvaluateWithinAnalyzer(GetMessagesPath("Users of Physics Lab (Group 1)", "Conversations"), "high-level-1");
await EvaluateWithinAnalyzer(GetMessagesPath("Users of Physics Lab (Group 1)", "Conversations"), "high-level-2");
await EvaluateWithinAnalyzer(GetMessagesPath("Users of Physics Lab (Group 1)", "Conversations"), "low-level-3");