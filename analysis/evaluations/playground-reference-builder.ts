import { InitializeEmbeddings } from '../../utils/embeddings.js';
import { GetMessagesPath, LoadCodebooks } from '../../utils/loader.js';
import { BuildReferenceAndExport } from './reference-builder.js';
import { ReferenceBuilder } from './reference-builder';

InitializeEmbeddings("gecko-768-similarity");

// Load the codebooks
var SourcePath = GetMessagesPath("Coded Dataset 1", "evaluation/reference-sources");
var TargetPath = GetMessagesPath("Coded Dataset 1", "evaluation/references/low-level-3");
var [Codebooks, Names] = await LoadCodebooks(SourcePath);

// Build the reference codebook
await BuildReferenceAndExport(new ReferenceBuilder(), Codebooks, TargetPath);

process.exit(0);