import { InitializeEmbeddings } from '../../utils/embeddings.js';
import { GetMessagesPath } from '../../utils/loader.js';
import { BuildReferenceAndExport } from './reference-builder.js';
import { LoadCodebooks } from './codebooks.js';
import { SimpleReferenceBuilder } from './reference-builder';

InitializeEmbeddings("gecko-768-similarity");

// Load the codebooks
var SourcePath = GetMessagesPath("Users of Physics Lab (Group 1)", "Conversations/evaluation/reference-sources");
var TargetPath = GetMessagesPath("Users of Physics Lab (Group 1)", "Conversations/evaluation/references/low-level-3");
var [Codebooks, Names] = LoadCodebooks(SourcePath);

// Build the reference codebook
await BuildReferenceAndExport(new SimpleReferenceBuilder(), Codebooks, TargetPath);

process.exit(0);