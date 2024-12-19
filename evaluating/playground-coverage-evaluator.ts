import { InitializeEmbeddings } from "../utils/embeddings.js";
import { GetMessagesPath } from "../utils/loader.js";

import { EvaluateCodebooksWithReference } from "./codebooks.js";
import { CoverageEvaluator } from "./coverage-evaluator.js";

InitializeEmbeddings("gecko-768-similarity");
const SourcePath = GetMessagesPath("Coded Dataset 1", "evaluation");
const Results = await EvaluateCodebooksWithReference(
    [`${SourcePath}/references/low-level-3.json`, `${SourcePath}/arena`],
    new CoverageEvaluator(),
);

process.exit(0);
