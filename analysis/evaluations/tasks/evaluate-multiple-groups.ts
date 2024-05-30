import * as File from 'fs';
import { GetMessagesPath } from "../../../utils/loader.js";
import { CoverageEvaluator } from "../coverage-evaluator.js";
import { BuildReferenceAndEvaluateCodebooksInGroups } from "../codebooks.js";
import { InitializeEmbeddings } from '../../../utils/embeddings.js';
import { EnsureFolder } from '../../../utils/llms.js';
import { RefiningReferenceBuilder } from '../reference-builder.js';
import { UseLLM } from '../../../translation/general.js';
import { ReferenceBuilder } from '../reference-builder.js';
import { NetworkEvaluator } from '../network-evaluator.js';

InitializeEmbeddings("gecko-768-similarity");
UseLLM("llama3-70b");

/** EvaluateMultipleGroups: Evaluate multiple groups of codebooks but merge each folder into one codebook. */
async function EvaluateMultipleGroups(SourcePath: string, TaskName: string, 
    ReferenceName: string, Builder: ReferenceBuilder, Sources: string[]) {
    // Ensure the folders
    var ReferencePath = SourcePath + "/evaluation/references";
    EnsureFolder(ReferencePath);
    var TargetPath = SourcePath + "/evaluation/results/" + TaskName + Builder.Suffix;
    EnsureFolder(TargetPath);
    // Build the reference and evaluate the codebooks
    var Evaluator = new NetworkEvaluator();
    var Results = await BuildReferenceAndEvaluateCodebooksInGroups(
        Sources.map(Path => SourcePath + "/" + Path), 
        ReferencePath + "/" + ReferenceName + Builder.Suffix, Builder, Evaluator, TargetPath);
    File.writeFileSync(TargetPath + "-" + Evaluator.Name + ".json", JSON.stringify(Results, null, 4));
}

await EvaluateMultipleGroups(GetMessagesPath("Coded Dataset 1"), 
    "human vs ai", "human-ai",
    new RefiningReferenceBuilder(),
    ["human", "high-level-2", "low-level-3"]);

process.exit(0);
