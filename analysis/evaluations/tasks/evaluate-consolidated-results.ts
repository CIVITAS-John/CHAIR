import * as File from 'fs';
import { GetMessagesPath, LoadDataset } from "../../../utils/loader.js";
import { CoverageEvaluator } from "../coverage-evaluator.js";
import { BuildReferenceAndEvaluateCodebooks } from "../codebooks.js";
import { InitializeEmbeddings } from '../../../utils/embeddings.js';
import { EnsureFolder } from '../../../utils/llms.js';
import { RefiningReferenceBuilder } from '../reference-builder.js';
import { UseLLM } from '../../../utils/llms.js';
import { ReferenceBuilder } from '../reference-builder';
import { NetworkEvaluator } from '../network-evaluator.js';

InitializeEmbeddings("gecko-768-similarity");
UseLLM("llama3-70b");

/** EvaluateConsolidatedResults: Evaluate some consolidated results. */
// Please run the evaluate-analyzers-with-same-models.ts script before running this script.
async function EvaluateConsolidatedResults(SourcePath: string, TaskName: string, 
    ReferenceName: string, Builder: ReferenceBuilder, ReferenceCodebooks: string[], ComparingCodebooks?: string[]) {
    // Get the dataset
    var Dataset = await LoadDataset(SourcePath);
    var Evaluator = new NetworkEvaluator(Dataset);
    SourcePath = GetMessagesPath(SourcePath);
    // Ensure the folders
    var ReferencePath = SourcePath + "/evaluation/references";
    EnsureFolder(ReferencePath);
    var TargetPath = SourcePath + "/evaluation/results/" + TaskName + Builder.Suffix;
    EnsureFolder(TargetPath);
    // Build the reference and evaluate the codebooks
    var Results = await BuildReferenceAndEvaluateCodebooks(
        ReferenceCodebooks.map(Path => ReferencePath + "/" + Path), 
        ReferencePath + "/" + ReferenceName + Builder.Suffix, Builder, Evaluator, TargetPath, 
        ComparingCodebooks?.map(Path => ReferencePath + "/" + Path));
    File.writeFileSync(TargetPath + "-" + Evaluator.Name + ".json", JSON.stringify(Results, null, 4));
}

await EvaluateConsolidatedResults("Coded Dataset 1", 
    "human vs ai", "human-ai-refined",
    new RefiningReferenceBuilder(),
    ["human-refined.json", "high-level-2-refined.json", "low-level-3-refined.json"]);

process.exit(0);

await EvaluateConsolidatedResults("Coded Dataset 1", 
    "llamas vs others high", "llama-other",
    new RefiningReferenceBuilder(),
    ["high-level-2-again-refined.json", "high-level-2-refined.json"]);


await EvaluateConsolidatedResults("Coded Dataset 1", 
    "human vs ai again", "human-ai",
    new RefiningReferenceBuilder(),
    ["human-refined.json", "high-level-2-again-refined.json", "low-level-3-again-refined.json"]);

await EvaluateConsolidatedResults("Coded Dataset 1", 
    "high-level 1 vs 2", "high-level-1-2",
    new RefiningReferenceBuilder(),
    ["high-level-1-refined.json", "high-level-2-refined.json"]);

await EvaluateConsolidatedResults("Coded Dataset 1", 
    "human vs high-level consolidated", "human-high-level-consolidated",
    new RefiningReferenceBuilder(),
    ["human-consolidated-refined.json", "high-level-2-consolidated-refined.json"]);

await EvaluateConsolidatedResults("Coded Dataset 1", 
    "high-level vs low-level consolidated", "all-analyzers",
    new RefiningReferenceBuilder(),
    ["high-level-2-consolidated-refined.json", "low-level-3-consolidated-refined.json"], ["high-level-2-consolidated-refined.json", "low-level-3-consolidated-refined.json"]);
File.copyFileSync(
    GetMessagesPath("Coded Dataset 1", "evaluation/references/all-analyzers-refined.json"),
    GetMessagesPath("Comparisons", "evaluation/references/group-1-refined.json"));
