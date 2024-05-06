import * as File from 'fs';
import { GetMessagesPath } from "../../../utils/loader.js";
import { CoverageEvaluator } from "../codebook-coverage-evaluator.js";
import { BuildReferenceAndEvaluateCodebooks } from "../codebooks.js";
import { InitializeEmbeddings } from '../../../utils/embeddings.js';
import { EnsureFolder } from '../../../utils/llms.js';

InitializeEmbeddings("gecko-768-similarity");

/* Example Task: Compare the performance between high-level-1 and high-level-2 analyzers. */
var SourcePath = GetMessagesPath("Users of Physics Lab (Group 1)", "Conversations");
var ReferencePath = SourcePath + "/evaluation/references";
EnsureFolder(ReferencePath);
var TargetPath = SourcePath + "/evaluation/results/high-level-comparison";
EnsureFolder(TargetPath);

// Build the reference and evaluate the codebooks
var Results = await BuildReferenceAndEvaluateCodebooks(
    [SourcePath + "/high-level-1", SourcePath + "/high-level-2"], ReferencePath + "/high-levels", new CoverageEvaluator());
File.writeFileSync(TargetPath + ".json", JSON.stringify(Results, null, 4));