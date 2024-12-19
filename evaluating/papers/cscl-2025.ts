import * as File from "fs";

import { InitializeEmbeddings } from "../../utils/embeddings.js";
import { EnsureFolder, LLMName, UseLLM, UseLLMs } from "../../utils/llms.js";
import { GetMessagesPath, LoadDataset } from "../../utils/loader.js";
import type { CodebookEvaluation } from "../../utils/schema.js";
import { BuildReferenceAndEvaluateCodebooks } from "../codebooks.js";
import { NetworkEvaluator } from "../network-evaluator.js";
import type { ReferenceBuilder } from "../reference-builder.js";
import { RefiningReferenceBuilder } from "../reference-builder.js";

// This code replicates our study for CSCL 2025 / ACL Rolling Review 2025.
// Specifically, it evaluates the performance of different codebooks in the pilot study.
// It also generates 60 evaluation runs for the output analysis.
// Running it requires access to the Groq API.
// It also needs access to the coded dataset, which we will release before the conference.

InitializeEmbeddings("gecko-768-similarity");

/** EvaluateInFolder: Evaluate the performance of different codebooks in the same folder with human results. */
async function EvaluateInFolder(SourcePath: string, Builder: ReferenceBuilder, Suffix: string, ...Folders: string[]) {
    // Get the dataset
    const Dataset = await LoadDataset(SourcePath);
    const Evaluator = new NetworkEvaluator({ Dataset, Title: Folders.join("-") + Suffix });
    SourcePath = GetMessagesPath(SourcePath);
    // Ensure the folders
    const EvaluationName = Folders.join("-") + Suffix;
    const ReferencePath = `${SourcePath}/cscl-2025/references`;
    EnsureFolder(ReferencePath);
    const TargetPath = `${SourcePath}/cscl-2025/results/${EvaluationName}`;
    EnsureFolder(TargetPath);
    // Build the reference and evaluate the codebooks
    if (Suffix != "-no-human") {
        Folders = Folders.concat("human");
    }
    const Results = await BuildReferenceAndEvaluateCodebooks(
        Folders.map((Folder) => `${SourcePath}/${Folder}`),
        `${ReferencePath}/${EvaluationName}`,
        Builder,
        Evaluator,
        TargetPath,
        true,
    );
    File.writeFileSync(`${TargetPath}-${Evaluator.Name}.json`, JSON.stringify(Results, null, 4));
    return Results;
}

/** RepeatedlyEvaluateInFolder: Repeatedly evaluate the performance of different codebooks in the same folder. */
async function RepeatedlyEvaluateInFolder(
    Times: number,
    Temperatures: number[],
    SourcePath: string,
    LLM: string,
    Builder: RefiningReferenceBuilder,
    ...Folders: string[]
) {
    // Prepare for the CSV
    const CSVResults = ["llm,temp,run,codebook,count,consolidated,coverage,density,novelty,divergence"];
    // Evaluate the codebooks multiple times
    for (var Temperature of Temperatures) {
        Builder.BaseTemperature = Temperature;
        var Results: Record<string, CodebookEvaluation>[] = [];
        for (var I = 0; I < Times; I++) {
            await UseLLMs(async () => {
                Results.push(await EvaluateInFolder(SourcePath, Builder, `-${Temperature}-${LLMName}`, ...Folders));
            }, `${LLM}_${I}`);
        }
        // Write the results to a CSV
        for (var I = 0; I < Times; I++) {
            const Result = Results[I];
            for (const Name in Result) {
                const Evaluation = Result[Name];
                CSVResults.push(
                    `${LLM},${Temperature},${I},${Name},${Evaluation.Count},${Evaluation.Consolidated},${Evaluation.Coverage},${Evaluation.Density},${Evaluation.Novelty},${Evaluation.Divergence}`,
                );
            }
        }
    }
    // Write the CSV to a file
    SourcePath = GetMessagesPath(SourcePath);
    if (Times > 1) {
        File.writeFileSync(`${SourcePath}/cscl-2025/results/${Folders.join("-")}-${LLM}.csv`, CSVResults.join("\n"));
    }
}

// Task: Compare the 5 approaches with GPT-4o described in the pilot study.
// Also, an output analysis of the results with 10 runs
// await RepeatedlyEvaluateInFolder(10, [0, 0.25, 0.5, 0.75, 1], "Coded Dataset 1", "gpt-4.5-mini", new RefiningReferenceBuilder(true, true), "pilot-study");
// await RepeatedlyEvaluateInFolder(10, [0, 0.25, 0.5, 0.75, 1], "Coded Dataset 1", "llama3-70b", new RefiningReferenceBuilder(true, true), "pilot-study");
// await RepeatedlyEvaluateInFolder(10, [0, 0.25, 0.5, 0.75, 1], "Coded Dataset 1", "gpt-4.5-omni", new RefiningReferenceBuilder(true, true), "pilot-study");
// await RepeatedlyEvaluateInFolder(10, [0, 0.25, 0.5, 0.75, 1], "Coded Dataset 2", "gpt-4.5-mini", new RefiningReferenceBuilder(true, true), "pilot-study");
// await RepeatedlyEvaluateInFolder(10, [0, 0.25, 0.5, 0.75, 1], "Coded Dataset 2", "llama3-70b", new RefiningReferenceBuilder(true, true), "pilot-study");
// await RepeatedlyEvaluateInFolder(10, [0, 0.25, 0.5, 0.75, 1], "Coded Dataset 2", "gpt-4.5-omni", new RefiningReferenceBuilder(true, true), "pilot-study", "human");

// Task: (Qualitatively) compare coding approaches' potential biases
// await RepeatedlyEvaluateInFolder(1, [0.5], "Coded Dataset 1", "gpt-4.5-omni", new RefiningReferenceBuilder(true, true), "pilot-study", "human");
// await RepeatedlyEvaluateInFolder(1, [0.5], "Coded Dataset 2", "gpt-4.5-omni", new RefiningReferenceBuilder(true, true), "pilot-study", "human");

// Task: (Qualitatively) compare coding approaches, but in 2 groups: BERTopic+High-level; Low-level+Humans
UseLLM("gpt-4.5-omni");
await EvaluateInFolder("Coded Dataset 1", new RefiningReferenceBuilder(true, true), "", "cscl-high-level");
await EvaluateInFolder("Coded Dataset 1", new RefiningReferenceBuilder(true, true), "-no-human", "cscl-high-level-no-human");
await EvaluateInFolder("Coded Dataset 1", new RefiningReferenceBuilder(true, true), "", "cscl-low-level");

// Task: Evaluate different models with the same approaches.
const Approaches = ["low-level-5", "high-level-2"];
for (const Approach of Approaches) {
    // await RepeatedlyEvaluateInFolder(10, [0.5], "Coded Dataset 1", "llama3-70b", new RefiningReferenceBuilder(true, true), Approach);
    // await RepeatedlyEvaluateInFolder(10, [0.5], "Coded Dataset 2", "llama3-70b", new RefiningReferenceBuilder(true, true), Approach);
    // GPT-4o is expensive and we don't see the advantage in computational metrics.
    // On the other hand, on the surface, it generates better labels during merging. So we use it for qualitative evaluation.
    // await RepeatedlyEvaluateInFolder(1, [0.5], "Coded Dataset 1", "gpt-4.5-omni", new RefiningReferenceBuilder(true, true), Approach);
    // await RepeatedlyEvaluateInFolder(1, [0.5], "Coded Dataset 2", "gpt-4.5-omni", new RefiningReferenceBuilder(true, true), Approach);
}

// Task: Compare between GPT-4o and GPT-4o-mini.
// await RepeatedlyEvaluateInFolder(10, [0.5], "Coded Dataset 1", "llama3-70b", new RefiningReferenceBuilder(true, true), "ll5-gpt4s", "ll5-gpt4ms");
// await RepeatedlyEvaluateInFolder(10, [0.5], "Coded Dataset 2", "llama3-70b", new RefiningReferenceBuilder(true, true), "ll5-gpt4s", "ll5-gpt4ms");

// Task: Evaluate different temperature with the low-level-5 approach.
// await RepeatedlyEvaluateInFolder(10, [0.5], "Coded Dataset 1", "llama3-70b", new RefiningReferenceBuilder(true, true), "ll5-gpt4", "ll5-except-gpt4");
// await RepeatedlyEvaluateInFolder(10, [0.5], "Coded Dataset 1", "llama3-70b", new RefiningReferenceBuilder(true, true), "ll5-llama", "ll5-except-llama");
// await RepeatedlyEvaluateInFolder(10, [0.5], "Coded Dataset 2", "llama3-70b", new RefiningReferenceBuilder(true, true), "ll5-gpt4", "ll5-except-gpt4");
// await RepeatedlyEvaluateInFolder(10, [0.5], "Coded Dataset 2", "llama3-70b", new RefiningReferenceBuilder(true, true), "ll5-llama", "ll5-except-llama");

// Task: Evaluate repeated runs with the low-level-5 approach.
// await RepeatedlyEvaluateInFolder(10, [0.5], "Coded Dataset 1", "llama3-70b", new RefiningReferenceBuilder(true, true), "ll5-gpt4s", "ll5-except-gpt4");
// await RepeatedlyEvaluateInFolder(10, [0.5], "Coded Dataset 1", "llama3-70b", new RefiningReferenceBuilder(true, true), "ll5-llamas", "ll5-except-llama");
// await RepeatedlyEvaluateInFolder(10, [0.5], "Coded Dataset 2", "llama3-70b", new RefiningReferenceBuilder(true, true), "ll5-gpt4s", "ll5-except-gpt4");
// await RepeatedlyEvaluateInFolder(10, [0.5], "Coded Dataset 2", "llama3-70b", new RefiningReferenceBuilder(true, true), "ll5-llamas", "ll5-except-llama");

process.exit(0);
