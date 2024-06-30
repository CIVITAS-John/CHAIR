import * as File from 'fs';
import { GetMessagesPath, LoadDataset } from "../../utils/loader.js";
import { CoverageEvaluator } from "../coverage-evaluator.js";
import { NetworkEvaluator } from '../network-evaluator.js';
import { BuildReferenceAndEvaluateCodebooks } from "../codebooks.js";
import { InitializeEmbeddings } from '../../utils/embeddings.js';
import { EnsureFolder, LLMName, UseLLMs } from '../../utils/llms.js';
import { ReferenceBuilder, RefiningReferenceBuilder } from '../reference-builder.js';
import { CodebookEvaluation } from '../../utils/schema.js';

// This code replicates our study for CHI 2025.
// Running it requires access to the Groq API.
// It also needs access to the coded dataset, which we will release before the conference.

InitializeEmbeddings("gecko-768-similarity");

/** EvaluateInFolder: Evaluate the performance of different codebooks in the same folder with human results. */
async function EvaluateInFolder(SourcePath: string, Folder: string, Builder: ReferenceBuilder, Suffix: string = "") {
    // Get the dataset
    var Dataset = await LoadDataset(SourcePath);
    var Evaluator = new NetworkEvaluator({ Dataset: Dataset, Title: Folder + Suffix });
    SourcePath = GetMessagesPath(SourcePath);
    // Ensure the folders
    var EvaluationName = Folder + Suffix;
    var ReferencePath = SourcePath + "/chi-2025/references";
    EnsureFolder(ReferencePath);
    var TargetPath = SourcePath + "/chi-2025/results/" + EvaluationName;
    EnsureFolder(TargetPath);
    // Build the reference and evaluate the codebooks
    var Results = await BuildReferenceAndEvaluateCodebooks(
        [SourcePath + "/" + Folder, SourcePath + "/human"], ReferencePath + "/" + EvaluationName, Builder, Evaluator, TargetPath);
    File.writeFileSync(TargetPath + "-" + Evaluator.Name + ".json", JSON.stringify(Results, null, 4));
    return Results;
}

/** RepeatedlyEvaluateInFolder: Repeatedly evaluate the performance of different codebooks in the same folder. */
async function RepeatedlyEvaluateInFolder(Times: number, Temperatures: number[], SourcePath: string, Folder: string, LLM: string, Builder: RefiningReferenceBuilder) {
    // Prepare for the CSV
    var CSVResults = ["llm,temp,run,codebook,count,consolidated,coverage,density,novelty,divergence"];
    // Evaluate the codebooks multiple times
    for (var Temperature of Temperatures) {
        Builder.BaseTemperature = Temperature;
        var Results: Record<string, CodebookEvaluation>[] = [];
        for (var I = 0; I < Times; I++) {
            await UseLLMs(async () => { Results.push(await EvaluateInFolder(SourcePath, Folder, Builder, `-${Temperature}-${LLMName}`)); }, `${LLM}_${I}`);
        }
        // Write the results to a CSV
        for (var I = 0; I < Times; I++) {
            var Result = Results[I];
            for (var Name in Result) {
                var Evaluation = Result[Name];
                CSVResults.push(`${LLM},${Temperature},${I},${Name},${Evaluation.Count},${Evaluation.Consolidated},${Evaluation.Coverage},${Evaluation.Density},${Evaluation.Novelty},${Evaluation.Divergence}`);
            }
        }
    }
    // Write the CSV to a file
    SourcePath = GetMessagesPath(SourcePath);
    File.writeFileSync(SourcePath + "/chi-2025/results/" + Folder + `-${LLM}.csv`, CSVResults.join("\n"));
}

// Task: Compare the 4 approaches with GPT-4o described in the pilot study.
// Also, an output analysis of the results with 10 runs
await RepeatedlyEvaluateInFolder(10, [0.25, 0.5], "Coded Dataset 1", "pilot-study", "llama3-70b", new RefiningReferenceBuilder(true, true));
await RepeatedlyEvaluateInFolder(10, [0.25, 0.5], "Coded Dataset 1", "pilot-study", "gpt-4.5-omni", new RefiningReferenceBuilder(true, true));

// Task: Evaluate the different of temperature with the low-level-4 approach.
// await UseLLMs(async () => await EvaluateModelsWithSameAnalyzer("Coded Dataset 1", "low-level-4-gpt-4o-temps", new RefiningReferenceBuilder(true, true)), "llama3-70b");
// await UseLLMs(async () => await EvaluateModelsWithSameAnalyzer("Coded Dataset 1", "low-level-4-llama-temps", new RefiningReferenceBuilder(true, true)), "llama3-70b");

process.exit(0);
