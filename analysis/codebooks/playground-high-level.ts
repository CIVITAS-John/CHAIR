import { UseLLMs } from '../../translation/general.js';
import { ConsolidateConversations } from './codebooks.js';
import { InitializeEmbeddings, Model } from '../../utils/embeddings.js';
import { PipelineConsolidator } from './consolidator.js';
import { DefinitionGenerator } from './definition-generator.js';
import { RefineMerger } from './refine-merger.js';
import { CategoryMerger } from './category-merger.js';
import { CategoryNameMerger } from './category-name-merger.js';
import { SimpleMerger } from './simple-merger.js';
import { CategoryRefiner } from './category-refiner.js';
import { CategoryAssigner } from './category-assigner.js';

await UseLLMs(async () => {
    InitializeEmbeddings("gecko-768-similarity");
    await ConsolidateConversations(new PipelineConsolidator(
        // Merge very similar names
        new SimpleMerger({}),
        // Generate definitions for missing ones
        new DefinitionGenerator(),
        // Merge definitions
        // For high-level codebooks, we use a lower threshold to avoid over-merging.
        new RefineMerger({ Threshold: 0.5, Penalty: 0, UseDefinition: false }),
        new RefineMerger({ Threshold: 0.5, Penalty: 0, Looping: true }),
        // Merge categories
        new CategoryNameMerger(),
        new CategoryMerger({ Looping: true, Threshold: 0.7, Penalty: 0.1 }),
        new CategoryNameMerger(),
        new CategoryRefiner(),
        // Assign categories to codes
        new CategoryAssigner()
    ), "Users of Physics Lab (Group 1)", "0~17-gpt-3.5-turbo.json", "high-level-2", "llama3-70b", false);
}, "llama3-70b"); // 

process.exit(0);