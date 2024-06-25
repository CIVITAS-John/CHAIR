import * as File from 'fs';
import { GetMessagesPath, LoadDataset } from "../../utils/loader.js";
import { CoverageEvaluator } from "../coverage-evaluator.js";
import { NetworkEvaluator } from '../network-evaluator.js';
import { BuildReferenceAndEvaluateCodebooks } from "../codebooks.js";
import { InitializeEmbeddings } from '../../utils/embeddings.js';
import { EnsureFolder, UseLLM } from '../../utils/llms.js';
import { ReferenceBuilder, RefiningReferenceBuilder } from '../reference-builder.js';

// This code replicates our study for CHI 2025.
// Running it requires access to the Groq API.
// It also needs access to the coded dataset, which we will release before the conference.

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
        [SourcePath + "/" + Analyzer, SourcePath + "/human"], ReferencePath + "/" + Analyzer + Builder.Suffix, Builder, Evaluator, TargetPath);
    File.writeFileSync(TargetPath + "-" + Evaluator.Name + ".json", JSON.stringify(Results, null, 4));
}

// Task 1: Compare the 4 approaches with GPT-4o described in the pilot study. 
// await EvaluateModelsWithSameAnalyzer("Coded Dataset 1", "pilot-study", new RefiningReferenceBuilder());

process.exit(0);
