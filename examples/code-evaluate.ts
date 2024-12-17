import * as File from "fs";

import { ProcessDataset } from "../analyzer.js";
import { BuildReferenceAndEvaluateCodebooks } from "../evaluating/codebooks.js";
import { NetworkEvaluator } from "../evaluating/network-evaluator.js";
import { ReferenceBuilder, RefiningReferenceBuilder } from "../evaluating/reference-builder.js";
import { InitializeEmbeddings } from "../utils/embeddings.js";
import { EnsureFolder, UseLLMs } from "../utils/llms.js";
import { GetMessagesPath, LoadDataset } from "../utils/loader.js";

// An example configuration
const Configuration = {
    Dataset: "data",
    EmbeddingModel: "openai-small-512",
    Steps: [
        {
            Action: "Code",
            Analyzers: ["low-level-5"],
            Models: ["gpt-4.5-omni", "gpt-4.5-mini"],
        },
        {
            Action: "Evaluate",
            Name: "evaluation",
            Analyzers: ["low-level-5"],
            Models: ["gpt-4.5-omni", "gpt-4.5-mini"],
            Evaluators: ["gpt-4.5-omni"],
        },
    ],
};

InitializeEmbeddings(Configuration.EmbeddingModel);

// Follow the configuration
for (const Step of Configuration.Steps) {
    switch (Step.Action) {
        case "Code":
            for (const Analyzer of Step.Analyzers) {
                await UseLLMs(
                    async () => {
                        await ProcessDataset(
                            new (
                                (await import(`./../coding/conversations/${Analyzer}.js`)) as {
                                    default: new () => Parameters<typeof ProcessDataset>[0];
                                }
                            ).default(),
                            Configuration.Dataset,
                            false,
                        );
                    },
                    ...Step.Models,
                );
            }
            break;
        case "Evaluate":
            if (!Step.Evaluators) {
                throw new Error("Evaluators are required for the evaluation step.");
            }
            await UseLLMs(
                async () => {
                    await Evaluate(Configuration.Dataset, new RefiningReferenceBuilder(), Step.Name, Step.Analyzers, Step.Models);
                },
                ...Step.Evaluators,
            );
            break;
    }
}

/** Evaluate: Evaluate the performance of multiple coding results. */
async function Evaluate(SourcePath: string, Builder: ReferenceBuilder, Suffix: string, Analyzers: string[], Models: string[]) {
    // Get the dataset
    const Dataset = LoadDataset(SourcePath);
    const Evaluator = new NetworkEvaluator({ Dataset: Dataset });
    SourcePath = GetMessagesPath(SourcePath);
    // Ensure the folders
    const ReferencePath = `${SourcePath}/references`;
    EnsureFolder(ReferencePath);
    const TargetPath = `${SourcePath}/evaluation/${Suffix}`;
    EnsureFolder(TargetPath);
    // Build the paths
    const Paths = Analyzers.flatMap((Analyzer) =>
        Models.flatMap((Model) => Object.keys(Dataset.Data).map((Name) => `${SourcePath}/${Analyzer}/${Name}-${Model}.json`)),
    );
    // Build the reference and evaluate the codebooks
    const Results = await BuildReferenceAndEvaluateCodebooks(
        Paths,
        `${ReferencePath}/${Analyzers.join("-")}_${Models.join("-")}${Builder.Suffix}`,
        Builder,
        Evaluator,
        TargetPath,
    );
    File.writeFileSync(`${TargetPath}-${Evaluator.Name}.json`, JSON.stringify(Results, null, 4));
}

process.exit(0);
