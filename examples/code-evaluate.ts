import * as File from "fs";
import { ProcessDataset } from "../analyzer.js";
import { EnsureFolder, UseLLMs } from "../utils/llms.js";
import { GetMessagesPath, LoadDataset } from "../utils/loader.js";
import { BuildReferenceAndEvaluateCodebooks } from "../evaluating/codebooks.js";
import { InitializeEmbeddings } from "../utils/embeddings.js";
import { ReferenceBuilder, RefiningReferenceBuilder } from "../evaluating/reference-builder.js";
import { NetworkEvaluator } from "../evaluating/network-evaluator.js";

// An example configuration
var Configuration = {
    Dataset: "data",
    EmbeddingModel: "openai-small-512",
    Steps: [
        {
            Action: "Code",
            Analyzers: ["low-level-5"],
            Models: ["llama3-70b"],
        },
        {
            Action: "Evaluate",
            Name: "evaluation",
            Analyzers: ["low-level-5"],
            Models: ["llama3-70b"],
            Evaluators: ["llama3-70b"],
        },
    ],
};

InitializeEmbeddings(Configuration.EmbeddingModel);

// Follow the configuration
for (var Step of Configuration.Steps) {
    switch (Step.Action) {
        case "Code":
            for (var Analyzer of Step.Analyzers!) {
                await UseLLMs(async () => {
                    await ProcessDataset(new (await import(`./../coding/conversations/${Analyzer}.js`)).default(), Configuration.Dataset, false);
                }, ...Step.Models!);
            }
            break;
        case "Evaluate":
            await UseLLMs(async () => {
                await Evaluate(Configuration.Dataset, new RefiningReferenceBuilder(), Step.Name ?? "evaluation", Step.Analyzers, Step.Models);
            }, ...Step.Evaluators!);
            break;
    }
}

/** Evaluate: Evaluate the performance of multiple coding results. */
async function Evaluate(SourcePath: string, Builder: ReferenceBuilder, Suffix: string, Analyzers: string[], Models: string[]) {
    // Get the dataset
    var Dataset = await LoadDataset(SourcePath);
    var Evaluator = new NetworkEvaluator({ Dataset: Dataset });
    SourcePath = GetMessagesPath(SourcePath);
    // Ensure the folders
    var ReferencePath = SourcePath + "/references";
    EnsureFolder(ReferencePath);
    var TargetPath = SourcePath + "/evaluation/" + Suffix;
    EnsureFolder(TargetPath);
    // Build the paths
    var Paths = Analyzers.flatMap((Analyzer) =>
        Models.flatMap((Model) => Object.keys(Dataset.Data).map((Name) => SourcePath + "/" + Analyzer + "/" + Name + "-" + Model + ".json")),
    );
    // Build the reference and evaluate the codebooks
    var Results = await BuildReferenceAndEvaluateCodebooks(
        Paths,
        ReferencePath + "/" + Analyzers.join("-") + "_" + Models.join("-") + Builder.Suffix,
        Builder,
        Evaluator,
        TargetPath,
    );
    File.writeFileSync(TargetPath + "-" + Evaluator.Name + ".json", JSON.stringify(Results, null, 4));
}

process.exit(0);
