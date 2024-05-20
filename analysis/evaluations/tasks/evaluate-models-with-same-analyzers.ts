import * as File from 'fs';
import { GetMessagesPath } from "../../../utils/loader.js";
import { CoverageEvaluator } from "../coverage-evaluator.js";
import { NetworkEvaluator } from '../network-evaluator.js';
import { BuildReferenceAndEvaluateCodebooks } from "../codebooks.js";
import { InitializeEmbeddings } from '../../../utils/embeddings.js';
import { EnsureFolder } from '../../../utils/llms.js';
import { ReferenceBuilder, RefiningReferenceBuilder } from '../reference-builder.js';
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
    var Evaluator = new NetworkEvaluator();
    var Results = await BuildReferenceAndEvaluateCodebooks(
        [SourcePath + "/" + Analyzer], ReferencePath + "/" + Analyzer + Builder.Suffix, Builder, Evaluator, TargetPath);
    File.writeFileSync(TargetPath + "-" + Evaluator.Name + ".json", JSON.stringify(Results, null, 4));
}

await EvaluateModelsWithSameAnalyzer(GetMessagesPath("Coded Dataset 1"), "human-consolidated", new RefiningReferenceBuilder()); 
await EvaluateModelsWithSameAnalyzer(GetMessagesPath("Coded Dataset 1"), "low-level-3-consolidated", new RefiningReferenceBuilder()); 
process.exit(0);

await EvaluateModelsWithSameAnalyzer(GetMessagesPath("Coded Dataset 1"), "high-level-2-consolidated", new RefiningReferenceBuilder());
await EvaluateModelsWithSameAnalyzer(GetMessagesPath("Coded Dataset 1"), "high-level-1-consolidated", new RefiningReferenceBuilder());
await EvaluateModelsWithSameAnalyzer(GetMessagesPath("Coded Dataset 1"), "lexie-vs-high-level", new RefiningReferenceBuilder());
await EvaluateModelsWithSameAnalyzer(GetMessagesPath("Coded Dataset 1"), "high-level-1", new RefiningReferenceBuilder());
await EvaluateModelsWithSameAnalyzer(GetMessagesPath("Coded Dataset 1"), "high-level-2", new RefiningReferenceBuilder());
await EvaluateModelsWithSameAnalyzer(GetMessagesPath("Coded Dataset 1"), "gpt-4-t-vs-o", new RefiningReferenceBuilder()); 
