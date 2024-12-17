import { InitializeEmbeddings } from "../utils/embeddings.js";
import { GetMessagesPath, LoadCodebooks } from "../utils/loader.js";
import { BuildReferenceAndExport } from "./reference-builder.js";
import { ReferenceBuilder } from "./reference-builder.js";

InitializeEmbeddings("gecko-768-similarity");

// Load the codebooks
const SourcePath = GetMessagesPath("Coded Dataset 1", "evaluation/reference-sources");
const TargetPath = GetMessagesPath("Coded Dataset 1", "evaluation/references/low-level-3");
const [Codebooks] = await LoadCodebooks(SourcePath);

// Build the reference codebook
await BuildReferenceAndExport(new ReferenceBuilder(), Codebooks, TargetPath);

process.exit(0);
