import * as File from 'fs';
import { GetMessagesPath } from "../../../utils/loader.js";
import { CoverageEvaluator } from "../coverage-evaluator.js";
import { BuildReferenceAndEvaluateCodebooks } from "../codebooks.js";
import { InitializeEmbeddings } from '../../../utils/embeddings.js';
import { EnsureFolder } from '../../../utils/llms.js';
import { ReferenceBuilder, RefiningReferenceBuilder, SimpleReferenceBuilder } from '../reference-builder.js';
import { UseLLM } from '../../../translation/general.js';

InitializeEmbeddings("gecko-768-similarity");
UseLLM("llama3-70b");

/** EvaluateModelsWithSameAnalyzer: Evaluate the performance of different models using the same analyzer. */
async function EvaluateModelsWithSameAnalyzer(SourcePath: string, Analyzer: string, Builder: ReferenceBuilder) {
    // Ensure the folders
    var ReferencePath = SourcePath + "/evaluation/references";
    EnsureFolder(ReferencePath);
    var TargetPath = SourcePath + "/evaluation/results/" + Analyzer + Builder.Suffix;
    EnsureFolder(TargetPath);
    // Build the reference and evaluate the codebooks
    var Results = await BuildReferenceAndEvaluateCodebooks(
        [SourcePath + "/" + Analyzer], ReferencePath + "/" + Analyzer + Builder.Suffix, Builder, new CoverageEvaluator(), TargetPath);
    File.writeFileSync(TargetPath + ".json", JSON.stringify(Results, null, 4));
}

// await EvaluateModelsWithSameAnalyzer(GetMessagesPath("Users of Physics Lab (Group 1)", "Conversations"), "high-level-1");
await EvaluateModelsWithSameAnalyzer(GetMessagesPath("Users of Physics Lab (Group 1)", "Conversations"), "high-level-2-consolidated", new RefiningReferenceBuilder());
await EvaluateModelsWithSameAnalyzer(GetMessagesPath("Users of Physics Lab (Group 1)", "Conversations"), "low-level-3-consolidated", new RefiningReferenceBuilder());