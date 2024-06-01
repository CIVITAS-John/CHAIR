import { UseLLMs } from '../../translation/general.js';
import { ConsolidateChunks } from './codebooks.js';
import { InitializeEmbeddings, Model } from '../../utils/embeddings.js';
import { PipelineConsolidator } from './consolidator.js';
import { DefinitionGenerator } from './definition-generator.js';
import { RefineMerger } from './refine-merger.js';
import { CategoryMerger } from './category-merger.js';
import { CategoryNameMerger } from './category-name-merger.js';
import { SimpleMerger } from './simple-merger.js';
import { CategoryRefiner } from './category-refiner.js';
import { CategoryAssigner } from './category-assigner.js';
import { LLMName } from '../../utils/llms.js';

await UseLLMs(async () => {
    InitializeEmbeddings("gecko-768-similarity");
    await ConsolidateChunks(new PipelineConsolidator(
        // Merge very similar names
        new SimpleMerger({}),
        // Generate definitions for missing ones
        new DefinitionGenerator(),
        // Merge definitions
        new RefineMerger({ Maximum: 0.5, UseDefinition: false }),
        new RefineMerger({ Maximum: 0.5, Looping: true }),
        new RefineMerger({ Maximum: 0.65, UseDefinition: false }),
        new RefineMerger({ Maximum: 0.65, Looping: true }),
        /*// Merge categories
        new CategoryNameMerger(),
        new CategoryMerger({ Looping: true }),
        new CategoryNameMerger(),
        new CategoryRefiner(),
        // Assign categories to codes
        new CategoryAssigner()*/
    ), "Coded Dataset 1", "0~16-gpt-4.5-omni.json", "low-level-3", LLMName, false);
}, "gpt-3.5-turbo", "gpt-4.5-turbo", "gpt-4.5-omni", "llama3-70b", "claude3-haiku", "claude3-sonnet"); // 

process.exit(0);