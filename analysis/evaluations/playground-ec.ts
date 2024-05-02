import { InitializeEmbeddings } from '../../utils/embeddings.js';
import { GetMessagesPath } from '../../utils/loader.js';
import { CoverageEvaluator } from './codebook-coverage-evaluator.js';
import { EvaluateCodebooks } from './codebooks.js';

InitializeEmbeddings("gecko-768-similarity");
await EvaluateCodebooks(GetMessagesPath("Users of Physics Lab (Group 1)", "Conversations/evaluation"), new CoverageEvaluator());

process.exit(0);