import * as File from 'fs';
import { InitializeEmbeddings } from '../../utils/embeddings.js';
import { GetMessagesPath } from '../../utils/loader.js';
import { BuildReference } from './codebook-reference-builder.js';
import { LoadCodebooks } from './codebooks.js';

InitializeEmbeddings("gecko-768-similarity");

// Load the codebooks
var SourcePath = GetMessagesPath("Users of Physics Lab (Group 1)", "Conversations/reference-sources");
var TargetPath = GetMessagesPath("Users of Physics Lab (Group 1)", "Conversations/evaluation/low-level-3-gpt-3.5-turbo.json");
var [Codebooks, Names] = LoadCodebooks(SourcePath);

// Build the reference codebook
var Result = await BuildReference(Codebooks);

// Export it to a file
File.writeFileSync(TargetPath, JSON.stringify(Result, null, 4), 'utf8');

process.exit(0);