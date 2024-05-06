import * as File from 'fs';
import { GetMessagesPath } from "../../../utils/loader.js";
import { CoverageEvaluator } from "../codebook-coverage-evaluator.js";
import { BuildReferenceAndEvaluateCodebooks } from "../codebooks.js";
import { InitializeEmbeddings } from '../../../utils/embeddings.js';
import { EnsureFolder } from '../../../utils/llms.js';

InitializeEmbeddings("gecko-768-similarity");

/** EvaluateModelsWithSameAnalyzer: Evaluate the performance of different models using the same analyzer. */
async function EvaluateModelsWithSameAnalyzer(SourcePath: string, Analyzer: string) {
    var ReferencePath = SourcePath + "/evaluation/references";
    EnsureFolder(ReferencePath);
    var TargetPath = SourcePath + "/evaluation/results/" + Analyzer;
    EnsureFolder(TargetPath);
    
    // Build the reference and evaluate the codebooks
    var Results = await BuildReferenceAndEvaluateCodebooks(
        [SourcePath + "/" + Analyzer], ReferencePath + "/" + Analyzer, new CoverageEvaluator(), TargetPath);
    File.writeFileSync(TargetPath + ".json", JSON.stringify(Results, null, 4));
}

await EvaluateModelsWithSameAnalyzer(GetMessagesPath("Users of Physics Lab (Group 1)", "Conversations"), "high-level-1");
await EvaluateModelsWithSameAnalyzer(GetMessagesPath("Users of Physics Lab (Group 1)", "Conversations"), "high-level-2");
await EvaluateModelsWithSameAnalyzer(GetMessagesPath("Users of Physics Lab (Group 1)", "Conversations"), "low-level-3");