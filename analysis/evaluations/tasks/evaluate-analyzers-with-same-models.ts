import * as File from 'fs';
import { GetMessagesPath } from "../../../utils/loader.js";
import { CoverageEvaluator } from "../coverage-evaluator.js";
import { BuildReferenceAndEvaluateCodebooks } from "../codebooks.js";
import { InitializeEmbeddings } from '../../../utils/embeddings.js';
import { EnsureFolder } from '../../../utils/llms.js';
import { ReferenceBuilder, RefiningReferenceBuilder, SimpleReferenceBuilder } from '../reference-builder.js';
import { UseLLM } from '../../../translation/general.js';

InitializeEmbeddings("gecko-768-similarity");
UseLLM("llama3-70b");

/** EvaluateAnalyzers: Evaluate the performance of different analyzers using the same model. */
async function EvaluateAnalyzers(SourcePath: string, Dataset: string, LLM: string, Builder: ReferenceBuilder, Analyzers: string[]) {
    // Ensure the folders
    var ReferencePath = SourcePath + "/evaluation/references";
    EnsureFolder(ReferencePath);
    var TargetPath = SourcePath + "/evaluation/results/" + LLM + Builder.Suffix;
    EnsureFolder(TargetPath);
    // Build the paths
    var Paths = Analyzers.map(Analyzer => SourcePath + "/" + Analyzer + "/" + Dataset + "-" + LLM + ".json");
    // Build the reference and evaluate the codebooks
    var Results = await BuildReferenceAndEvaluateCodebooks(
        Paths, ReferencePath + "/" + LLM + Builder.Suffix, new SimpleReferenceBuilder(), new CoverageEvaluator(), TargetPath);
    File.writeFileSync(TargetPath + ".json", JSON.stringify(Results, null, 4));
}

await EvaluateAnalyzers(GetMessagesPath("Coded Dataset 1", "Conversations"), "0~16-gpt-3.5-turbo", 
    "llama3-70b", new RefiningReferenceBuilder(),
    ["high-level-1", "high-level-2", "low-level-3"]);