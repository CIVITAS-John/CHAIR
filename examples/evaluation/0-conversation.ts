import * as File from 'fs';
import { GetMessagesPath, LoadDataset } from "../../utils/loader.js";
import { BuildReferenceAndEvaluateCodebooks } from "../../evaluating/codebooks.js";
import { InitializeEmbeddings } from '../../utils/embeddings.js';
import { EnsureFolder, UseLLM } from '../../utils/llms.js';
import { ReferenceBuilder, RefiningReferenceBuilder } from '../../evaluating/reference-builder.js';
import { NetworkEvaluator } from '../../evaluating/network-evaluator.js';

InitializeEmbeddings("gecko-768-similarity");
UseLLM("gpt-4.5-omni");

/** EvaluateAnalyzers: Evaluate the performance of different analyzers using the same model. */
async function EvaluateAnalyzers(SourcePath: string, LLM: string, Builder: ReferenceBuilder, Suffix: string, Analyzers: string[]) {
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
    var Paths = Analyzers.flatMap(Analyzer => 
        Object.keys(Dataset.Data).map(Name => SourcePath + "/" + Analyzer + "/" + Name + "-" + LLM + ".json"));
    // Build the reference and evaluate the codebooks
    var Results = await BuildReferenceAndEvaluateCodebooks(
        Paths, ReferencePath + "/" + LLM + Suffix + Builder.Suffix, Builder, Evaluator, TargetPath);
    File.writeFileSync(TargetPath + "-" + Evaluator.Name + ".json", JSON.stringify(Results, null, 4));
}

await EvaluateAnalyzers("Conversation-Example", 
    "gpt-4.5-omni", new RefiningReferenceBuilder(), "",
    ["low-level-5"]);
