import * as File from "fs";
import { GetMessagesPath, LoadDataset } from "../../utils/loader.js";
import { CoverageEvaluator } from "../coverage-evaluator.js";
import { NetworkEvaluator } from "../network-evaluator.js";
import { BuildReferenceAndEvaluateCodebooks } from "../codebooks.js";
import { InitializeEmbeddings } from "../../utils/embeddings.js";
import { EnsureFolder, LLMName, UseLLMs } from "../../utils/llms.js";
import { ReferenceBuilder, RefiningReferenceBuilder } from "../reference-builder.js";
import { CodebookEvaluation } from "../../utils/schema.js";

// This code replicates our study for CHI 2025.
// Specifically, it evaluates the performance of different codebooks in the pilot study.
// It also generates 60 evaluation runs for the output analysis.
// Running it requires access to the Groq API.
// It also needs access to the coded dataset, which we will release before the conference.

InitializeEmbeddings("gecko-768-similarity");

/** EvaluateInFolder: Evaluate the performance of different codebooks in the same folder with human results. */
async function EvaluateInFolder(SourcePath: string, Builder: ReferenceBuilder, Suffix: string, ...Folders: string[]) {
    // Get the dataset
    var Dataset = await LoadDataset(SourcePath);
    var Evaluator = new NetworkEvaluator({ Dataset: Dataset, Title: Folders.join("-") + Suffix });
    SourcePath = GetMessagesPath(SourcePath);
    // Ensure the folders
    var EvaluationName = Folders.join("-") + Suffix;
    var ReferencePath = SourcePath + "/chi-2025/references";
    EnsureFolder(ReferencePath);
    var TargetPath = SourcePath + "/chi-2025/results/" + EvaluationName;
    EnsureFolder(TargetPath);
    // Build the reference and evaluate the codebooks
    var Results = await BuildReferenceAndEvaluateCodebooks(
        Folders.concat(["human"]).map((Folder) => SourcePath + "/" + Folder),
        ReferencePath + "/" + EvaluationName,
        Builder,
        Evaluator,
        TargetPath,
        true,
    );
    File.writeFileSync(TargetPath + "-" + Evaluator.Name + ".json", JSON.stringify(Results, null, 4));
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
    var CSVResults = ["llm,temp,run,codebook,count,consolidated,coverage,density,novelty,divergence"];
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
            var Result = Results[I];
            for (var Name in Result) {
                var Evaluation = Result[Name];
                CSVResults.push(
                    `${LLM},${Temperature},${I},${Name},${Evaluation.Count},${Evaluation.Consolidated},${Evaluation.Coverage},${Evaluation.Density},${Evaluation.Novelty},${Evaluation.Divergence}`,
                );
            }
        }
    }
    // Write the CSV to a file
    SourcePath = GetMessagesPath(SourcePath);
    if (Times > 1) File.writeFileSync(SourcePath + "/chi-2025/results/" + Folders.join("-") + `-${LLM}.csv`, CSVResults.join("\n"));
}

// Task: Compare the 4 approaches with GPT-4o described in the pilot study.
// Also, an output analysis of the results with 10 runs
// await RepeatedlyEvaluateInFolder(10, [0, 0.25, 0.5, 0.75, 1], "Coded Dataset 1", "gpt-4.5-mini", new RefiningReferenceBuilder(true, true), "pilot-study");
// await RepeatedlyEvaluateInFolder(10, [0, 0.25, 0.5, 0.75, 1], "Coded Dataset 1", "llama3-70b", new RefiningReferenceBuilder(true, true), "pilot-study");
// await RepeatedlyEvaluateInFolder(10, [0, 0.25, 0.5, 0.75, 1], "Coded Dataset 1", "gpt-4.5-omni", new RefiningReferenceBuilder(true, true), "pilot-study");
// await RepeatedlyEvaluateInFolder(10, [0, 0.25, 0.5, 0.75, 1], "Coded Dataset 2", "gpt-4.5-mini", new RefiningReferenceBuilder(true, true), "pilot-study");
// await RepeatedlyEvaluateInFolder(10, [0, 0.25, 0.5, 0.75, 1], "Coded Dataset 2", "llama3-70b", new RefiningReferenceBuilder(true, true), "pilot-study");
// await RepeatedlyEvaluateInFolder(10, [0, 0.25, 0.5, 0.75, 1], "Coded Dataset 2", "gpt-4.5-omni", new RefiningReferenceBuilder(true, true), "pilot-study");

// Task: (Qualitatively) compare coding approaches' potential biases
await RepeatedlyEvaluateInFolder(1, [0.5], "Coded Dataset 1", "gpt-4.5-omni", new RefiningReferenceBuilder(true, true), "pilot-study");
await RepeatedlyEvaluateInFolder(1, [0.5], "Coded Dataset 2", "gpt-4.5-omni", new RefiningReferenceBuilder(true, true), "pilot-study");

// Task: Does it matter if we only merge very similar names?
// We don't report this, but yes, it biases towards having more codes (low-level-*).
/* await UseLLMs(async () => {
    await EvaluateInFolder("Coded Dataset 1", "pilot-study", new ReferenceBuilder());
    await EvaluateInFolder("Coded Dataset 2", "pilot-study", new ReferenceBuilder());
}, "gpt-4.5-omni"); */

// Task: Evaluate different models with the same approaches.
var Approaches = ["low-level-5", "high-level-2"];
for (var Approach of Approaches) {
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
