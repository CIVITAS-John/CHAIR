import * as File from 'fs';
import { GetMessagesPath, LoadDataset } from "../../utils/loader.js";
import { CoverageEvaluator } from "../coverage-evaluator.js";
import { NetworkEvaluator } from '../network-evaluator.js';
import { BuildReferenceAndEvaluateCodebooks } from "../codebooks.js";
import { InitializeEmbeddings } from '../../utils/embeddings.js';
import { EnsureFolder, LLMName, UseLLM, UseLLMs } from '../../utils/llms.js';
import { ReferenceBuilder, RefiningReferenceBuilder } from '../reference-builder.js';

// This code replicates our study for CHI 2025.
// Running it requires access to the Groq API.
// It also needs access to the coded dataset, which we will release before the conference.

InitializeEmbeddings("gecko-768-similarity");

/** EvaluateModelsWithSameAnalyzer: Evaluate the performance of different models using the same analyzer. */
async function EvaluateModelsWithSameAnalyzer(SourcePath: string, Analyzer: string, Builder: ReferenceBuilder) {
    // Get the dataset
    var Dataset = await LoadDataset(SourcePath);
    var Evaluator = new NetworkEvaluator({ Dataset: Dataset, Title: Analyzer + "-" + LLMName });
    SourcePath = GetMessagesPath(SourcePath);
    // Ensure the folders
    var EvaluationName = Analyzer + "-" + LLMName + Builder.Suffix;
    var ReferencePath = SourcePath + "/evaluation/references";
    EnsureFolder(ReferencePath);
    var TargetPath = SourcePath + "/evaluation/results/" + EvaluationName;
    EnsureFolder(TargetPath);
    // Build the reference and evaluate the codebooks
    var Results = await BuildReferenceAndEvaluateCodebooks(
        [SourcePath + "/" + Analyzer, SourcePath + "/human"], ReferencePath + "/" + EvaluationName, Builder, Evaluator, TargetPath);
    File.writeFileSync(TargetPath + "-" + Evaluator.Name + ".json", JSON.stringify(Results, null, 4));
}

// Task: Compare the 4 approaches with GPT-4o described in the pilot study.
// Also, an output analysis of the results with 5 runs
for (var I = 0; I < 5; I++) {
    await UseLLMs(async () => await EvaluateModelsWithSameAnalyzer("Coded Dataset 1", "pilot-study", new RefiningReferenceBuilder(true, true)), `llama3-70b_${I}`);
    // await UseLLMs(async () => await EvaluateModelsWithSameAnalyzer("Coded Dataset 1", "pilot-study", new RefiningReferenceBuilder(true, true)), `gpt-4.5-omni_${I}`); 
}

// Task: Evaluate the different of temperature with the low-level-4 approach.
// await UseLLMs(async () => await EvaluateModelsWithSameAnalyzer("Coded Dataset 1", "low-level-4-gpt-4o-temps", new RefiningReferenceBuilder(true, true)), "llama3-70b");
// await UseLLMs(async () => await EvaluateModelsWithSameAnalyzer("Coded Dataset 1", "low-level-4-llama-temps", new RefiningReferenceBuilder(true, true)), "llama3-70b");

process.exit(0);
