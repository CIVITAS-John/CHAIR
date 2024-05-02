import { InitializeEmbeddings } from '../../utils/embeddings.js';
import { GetMessagesPath } from '../../utils/loader.js';
import { CoverageEvaluator } from './codebook-coverage-evaluator.js';
import { EvaluateCodebooks } from './codebooks.js';

InitializeEmbeddings("gecko-768-similarity");
var SourcePath = GetMessagesPath("Users of Physics Lab (Group 1)", "Conversations/evaluation");
await EvaluateCodebooks(
    [SourcePath + "/references/low-level-3-gpt-3.5-turbo.json", SourcePath + "/arena"], new CoverageEvaluator());

process.exit(0);