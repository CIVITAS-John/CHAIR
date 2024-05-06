import { InitializeEmbeddings } from '../../utils/embeddings.js';
import { GetMessagesPath } from '../../utils/loader.js';
import { CoverageEvaluator } from './coverage-evaluator.js';
import { EvaluateCodebooksWithReference } from './codebooks.js';

InitializeEmbeddings("gecko-768-similarity");
var SourcePath = GetMessagesPath("Users of Physics Lab (Group 1)", "Conversations/evaluation");
var Results = await EvaluateCodebooksWithReference(
    [SourcePath + "/references/low-level-3.json", SourcePath + "/arena"], new CoverageEvaluator());

process.exit(0);