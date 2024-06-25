import * as File from 'fs';
import { GetMessagesPath, LoadDataset } from "../../utils/loader.js";
import { CoverageEvaluator } from "../coverage-evaluator.js";
import { NetworkEvaluator } from '../network-evaluator.js';
import { BuildReferenceAndEvaluateCodebooks } from "../codebooks.js";
import { InitializeEmbeddings } from '../../utils/embeddings.js';
import { EnsureFolder, UseLLM } from '../../utils/llms.js';
import { ReferenceBuilder, RefiningReferenceBuilder } from '../reference-builder.js';

InitializeEmbeddings("gecko-768-similarity");
UseLLM("llama3-70b");

/** EvaluateModelsWithSameAnalyzer: Evaluate the performance of different models using the same analyzer. */
async function EvaluateModelsWithSameAnalyzer(SourcePath: string, Analyzer: string, Builder: ReferenceBuilder) {
    // Get the dataset
    var Dataset = await LoadDataset(SourcePath);
    var Evaluator = new NetworkEvaluator(Dataset);
    SourcePath = GetMessagesPath(SourcePath);
    // Ensure the folders
    var ReferencePath = SourcePath + "/evaluation/references";
    EnsureFolder(ReferencePath);
    var TargetPath = SourcePath + "/evaluation/results/" + Analyzer + Builder.Suffix;
    EnsureFolder(TargetPath);
    // Build the reference and evaluate the codebooks
    var Results = await BuildReferenceAndEvaluateCodebooks(
        [SourcePath + "/" + Analyzer], ReferencePath + "/" + Analyzer + Builder.Suffix, Builder, Evaluator, TargetPath);
    File.writeFileSync(TargetPath + "-" + Evaluator.Name + ".json", JSON.stringify(Results, null, 4));
}

// await EvaluateModelsWithSameAnalyzer("Coded Dataset 1", "high-level-1", new RefiningReferenceBuilder()); 
// await EvaluateModelsWithSameAnalyzer("Coded Dataset 1", "high-level-2", new RefiningReferenceBuilder()); 
// await EvaluateModelsWithSameAnalyzer("Coded Dataset 1", "low-level-3", new RefiningReferenceBuilder());
// await EvaluateModelsWithSameAnalyzer("Coded Dataset 1", "low-level-4", new RefiningReferenceBuilder());
// await EvaluateModelsWithSameAnalyzer("Coded Dataset 1", "human", new RefiningReferenceBuilder()); 
process.exit(0);

await EvaluateModelsWithSameAnalyzer("Coded Dataset 1", "high-level-2-again", new RefiningReferenceBuilder());
await EvaluateModelsWithSameAnalyzer("Coded Dataset 1", "human-consolidated", new RefiningReferenceBuilder()); 
await EvaluateModelsWithSameAnalyzer("Coded Dataset 1", "high-level-2-consolidated", new RefiningReferenceBuilder()); 
await EvaluateModelsWithSameAnalyzer("Coded Dataset 1", "low-level-3-consolidated", new RefiningReferenceBuilder()); 
await EvaluateModelsWithSameAnalyzer("Coded Dataset 1", "high-level-2-consolidated", new RefiningReferenceBuilder());
await EvaluateModelsWithSameAnalyzer("Coded Dataset 1", "high-level-1-consolidated", new RefiningReferenceBuilder());
await EvaluateModelsWithSameAnalyzer("Coded Dataset 1", "lexie-vs-high-level", new RefiningReferenceBuilder());
await EvaluateModelsWithSameAnalyzer("Coded Dataset 1", "gpt-4-t-vs-o", new RefiningReferenceBuilder()); 
await EvaluateModelsWithSameAnalyzer("Coded Dataset 1", "claude-3.5-vs-3", new RefiningReferenceBuilder()); 
