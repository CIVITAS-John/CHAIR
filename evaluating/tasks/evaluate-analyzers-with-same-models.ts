import * as File from "fs";

import { InitializeEmbeddings } from "../../utils/embeddings.js";
import { EnsureFolder, UseLLM } from "../../utils/llms.js";
import { GetMessagesPath, LoadDataset } from "../../utils/loader.js";
import { BuildReferenceAndEvaluateCodebooks } from "../codebooks.js";
import { CoverageEvaluator } from "../coverage-evaluator.js";
import { NetworkEvaluator } from "../network-evaluator.js";
import type { ReferenceBuilder } from "../reference-builder.js";
import { RefiningReferenceBuilder } from "../reference-builder.js";

InitializeEmbeddings("gecko-768-similarity");
UseLLM("llama3-70b");

/** EvaluateAnalyzers: Evaluate the performance of different analyzers using the same model. */
async function EvaluateAnalyzers(SourcePath: string, LLM: string, Builder: ReferenceBuilder, Suffix: string, Analyzers: string[]) {
    // Get the dataset
    const Dataset = await LoadDataset(SourcePath);
    const Evaluator = new NetworkEvaluator({ Dataset });
    SourcePath = GetMessagesPath(SourcePath);
    // Ensure the folders
    const ReferencePath = `${SourcePath}/evaluation/references`;
    EnsureFolder(ReferencePath);
    const TargetPath = `${SourcePath}/evaluation/results/${LLM}${Builder.Suffix}`;
    EnsureFolder(TargetPath);
    // Build the paths
    const Paths = Analyzers.flatMap((Analyzer) => Object.keys(Dataset.Data).map((Name) => `${SourcePath}/${Analyzer}/${Name}-${LLM}.json`));
    // Build the reference and evaluate the codebooks
    const Results = await BuildReferenceAndEvaluateCodebooks(
        Paths,
        `${ReferencePath}/${LLM}${Suffix}${Builder.Suffix}`,
        Builder,
        Evaluator,
        TargetPath,
    );
    File.writeFileSync(`${TargetPath}-${Evaluator.Name}.json`, JSON.stringify(Results, null, 4));
}

await EvaluateAnalyzers("Coded Dataset 2", "llama3-70b", new RefiningReferenceBuilder(), "", [
    "bertopic-2",
    "high-level-1",
    "high-level-2",
    "low-level-3",
    "low-level-4",
]);

/* await EvaluateAnalyzers("Coded Dataset 1", 
    "llama3-70b", new RefiningReferenceBuilder(), "-temp",
    ["low-level-4-temp-0", "low-level-4-temp-0.25", "low-level-4-temp-0.5", "low-level-4-temp-0.75", "low-level-4-temp-1"]);*/
