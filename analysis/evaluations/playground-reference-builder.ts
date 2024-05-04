import * as File from 'fs';
import { InitializeEmbeddings } from '../../utils/embeddings.js';
import { GetMessagesPath } from '../../utils/loader.js';
import { BuildReference } from './codebook-reference-builder.js';
import { LoadCodebooks } from './codebooks.js';
import chalk from 'chalk';
import { ExportConversationsForCoding } from '../../utils/export.js';

InitializeEmbeddings("gecko-768-similarity");

// Load the codebooks
var SourcePath = GetMessagesPath("Users of Physics Lab (Group 1)", "Conversations/evaluation/reference-sources");
var TargetPath = GetMessagesPath("Users of Physics Lab (Group 1)", "Conversations/evaluation/references/low-level-3");
var [Codebooks, Names] = LoadCodebooks(SourcePath);

// Build the reference codebook
var Result = await BuildReference(Codebooks);

// Export it to JSON
console.log(chalk.green(`Exporting the reference codebook to ${TargetPath}.`));
File.writeFileSync(TargetPath + ".json", JSON.stringify(Result, null, 4), 'utf8');

// Export it to Excel
var Book = ExportConversationsForCoding([], { Codebook: Result, Threads: {} });
await Book.xlsx.writeFile(TargetPath + ".xlsx");

process.exit(0);