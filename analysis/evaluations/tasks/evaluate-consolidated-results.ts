import * as File from 'fs';
import { GetMessagesPath } from "../../../utils/loader.js";
import { CoverageEvaluator } from "../coverage-evaluator.js";
import { BuildReferenceAndEvaluateCodebooks } from "../codebooks.js";
import { InitializeEmbeddings } from '../../../utils/embeddings.js';
import { EnsureFolder } from '../../../utils/llms.js';
import { RefiningReferenceBuilder, SimpleReferenceBuilder } from '../reference-builder.js';
import { UseLLM } from '../../../translation/general.js';
import { ReferenceBuilder } from '../reference-builder';

InitializeEmbeddings("gecko-768-similarity");
UseLLM("llama3-70b");

/** EvaluateConsolidatedResults: Evaluate some consolidated results. */
// Please run the evaluate-analyzers-with-same-models.ts script before running this script.
async function EvaluateConsolidatedResults(SourcePath: string, TaskName: string, 
    ReferenceName: string, Builder: ReferenceBuilder, ReferenceCodebooks: string[], ComparingCodebooks?: string[]) {
    // Ensure the folders
    var ReferencePath = SourcePath + "/evaluation/references";
    EnsureFolder(ReferencePath);
    var TargetPath = SourcePath + "/evaluation/results/" + TaskName + Builder.Suffix;
    EnsureFolder(TargetPath);
    // Build the reference and evaluate the codebooks
    var Results = await BuildReferenceAndEvaluateCodebooks(
        ReferenceCodebooks.map(Path => ReferencePath + "/" + Path), 
        ReferencePath + "/" + ReferenceName + Builder.Suffix, Builder, new CoverageEvaluator(), TargetPath, 
        ComparingCodebooks?.map(Path => ReferencePath + "/" + Path));
    File.writeFileSync(TargetPath + ".json", JSON.stringify(Results, null, 4));
}

await EvaluateConsolidatedResults(GetMessagesPath("Users of Physics Lab (Group 1)", "Conversations"), 
    "high-level vs low-level consolidated", "all-analyzers",
    new RefiningReferenceBuilder(),
    ["high-level-2-consolidated.json", "low-level-3-consolidated.json"], ["high-level-2-consolidated.json", "low-level-3-consolidated.json"]);