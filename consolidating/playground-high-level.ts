import { InitializeEmbeddings } from "../utils/embeddings.js";
import { LLMName, UseLLMs } from "../utils/llms.js";

import { ConsolidateChunks } from "./codebooks.js";
import { PipelineConsolidator } from "./consolidator.js";
import { DefinitionGenerator } from "./definition-generator.js";
import { RefineMerger } from "./refine-merger.js";
import { SimpleMerger } from "./simple-merger.js";

await UseLLMs(
    async () => {
        InitializeEmbeddings("gecko-768-similarity");
        await ConsolidateChunks(
            new PipelineConsolidator(
                // Merge very similar names
                new SimpleMerger({}),
                // Generate definitions for missing ones
                new DefinitionGenerator(),
                // Merge definitions
                // For high-level codebooks, we use a lower threshold to avoid over-merging.
                new RefineMerger({ Maximum: 0.5, Minimum: 0.45, UseDefinition: false }),
                new RefineMerger({ Maximum: 0.5, Minimum: 0.45, Looping: true }),
                new RefineMerger({ Maximum: 0.65, UseDefinition: false }),
                new RefineMerger({ Maximum: 0.65, Looping: true }),
                /*// Merge categories
        new CategoryNameMerger(),
        new CategoryMerger({ Looping: true }),
        new CategoryNameMerger(),
        new CategoryRefiner(),
        // Assign categories to codes
        new CategoryAssigner()*/
            ),
            "Coded Dataset 1",
            "0~16-gpt-4.5-omni.json",
            "high-level-2",
            LLMName,
            false,
        );
    },
    "llama3-70b",
    "llama3-70b-1",
    "llama3-70b-2",
    "llama3-70b-3",
    "llama3-70b-4",
    "llama3-70b-5",
); // "gpt-3.5-turbo", "llama3-70b", "gpt-4.5-turbo", "gpt-4.5-omni", "claude3-haiku", "claude3-sonnet"

process.exit(0);
