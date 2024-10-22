import * as File from "fs";
import { ProcessDataset } from "../analyzer.js";
import { EnsureFolder, UseLLMs } from "../utils/llms.js";
import { GetMessagesPath, LoadDataset } from "../utils/loader.js";
import { BuildReferenceAndEvaluateCodebooks } from "../evaluating/codebooks.js";
import { InitializeEmbeddings } from '../utils/embeddings.js';
import { ReferenceBuilder, RefiningReferenceBuilder } from '../evaluating/reference-builder.js';
import { NetworkEvaluator } from '../evaluating/network-evaluator.js';

// An example configuration
var Configuration = {
    "Dataset": "data",
    "Steps": [
        { 
            "Action": "Code",
            "Analyzers": ["low-level-5"],
            "Models": ["gpt-4.5-omni"]
        },
        {
            "Action": "Evaluate",
            "Analyzers": ["low-level-5"],
            "Models": ["gpt-4.5-omni"]
        }
    ]
};

InitializeEmbeddings("gecko-768-similarity");

// Follow the configuration
for (var Step of Configuration.Steps) {
    switch (Step.Action) {
        case "Code":
            for (var Analyzer of Step.Analyzers) {
                await UseLLMs(async () => {
                    await ProcessDataset(new (await import(`./../coding/conversations/${Analyzer}.js`)).default(), Configuration.Dataset, false);
                });
            }
            break;
        case "Evaluate":
            await UseLLMs(async () => {
                await EvaluateAnalyzers(Configuration.Dataset, Step.Models[0], new RefiningReferenceBuilder(), "", [Analyzer]);
            });
            break;
    }
}

/** EvaluateAnalyzers: Evaluate the performance of different analyzers using the same model. */
async function EvaluateAnalyzers(SourcePath: string, LLM: string, Builder: ReferenceBuilder, Suffix: string, Analyzers: string[]) {
    // Get the dataset
    var Dataset = await LoadDataset(SourcePath);
    var Evaluator = new NetworkEvaluator({ Dataset: Dataset });
    SourcePath = GetMessagesPath(SourcePath);
    // Ensure the folders
    var ReferencePath = SourcePath + "/references";
    EnsureFolder(ReferencePath);
    var TargetPath = SourcePath + "/evaluation/" + LLM + Builder.Suffix;
    EnsureFolder(TargetPath);
    // Build the paths
    var Paths = Analyzers.flatMap(Analyzer => 
        Object.keys(Dataset.Data).map(Name => SourcePath + "/" + Analyzer + "/" + Name + "-" + LLM + ".json"));
    // Build the reference and evaluate the codebooks
    var Results = await BuildReferenceAndEvaluateCodebooks(
        Paths, ReferencePath + "/" + LLM + Suffix + Builder.Suffix, Builder, Evaluator, TargetPath);
    File.writeFileSync(TargetPath + "-" + Evaluator.Name + ".json", JSON.stringify(Results, null, 4));
}

process.exit(0);