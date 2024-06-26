import * as File from 'fs';
import { GetMessagesPath, LoadDataset } from "../../utils/loader.js";
import { CoverageEvaluator } from "../coverage-evaluator.js";
import { BuildReferenceAndEvaluateCodebooks } from "../codebooks.js";
import { InitializeEmbeddings } from '../../utils/embeddings.js';
import { EnsureFolder, UseLLM } from '../../utils/llms.js';
import { ReferenceBuilder, RefiningReferenceBuilder } from '../reference-builder.js';
import { NetworkEvaluator } from '../network-evaluator.js';

InitializeEmbeddings("gecko-768-similarity");
UseLLM("llama3-70b");

/** EvaluateAnalyzers: Evaluate the performance of different analyzers using the same model. */
async function EvaluateAnalyzers(SourcePath: string, LLM: string, Builder: ReferenceBuilder, Analyzers: string[]) {
    // Get the dataset
    var Dataset = await LoadDataset(SourcePath);
    var Evaluator = new NetworkEvaluator({ Dataset: Dataset });
    SourcePath = GetMessagesPath(SourcePath);
    // Ensure the folders
    var ReferencePath = SourcePath + "/evaluation/references";
    EnsureFolder(ReferencePath);
    var TargetPath = SourcePath + "/evaluation/results/" + LLM + Builder.Suffix;
    EnsureFolder(TargetPath);
    // Build the paths
    var Paths = Analyzers.map(Analyzer => SourcePath + "/" + Analyzer + "/" + Dataset + "-" + LLM + ".json");
    // Build the reference and evaluate the codebooks
    var Results = await BuildReferenceAndEvaluateCodebooks(
        Paths, ReferencePath + "/" + LLM + Builder.Suffix, Builder, Evaluator, TargetPath);
    File.writeFileSync(TargetPath + "-" + Evaluator.Name + ".json", JSON.stringify(Results, null, 4));
}

await EvaluateAnalyzers("Coded Dataset 1", 
    "llama3-70b", new RefiningReferenceBuilder(),
    ["high-level-1", "high-level-2", "low-level-3"]);