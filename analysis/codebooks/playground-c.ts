import { UseLLMs } from '../../translation/general.js';
import { ConsolidateConversations } from './codebooks.js';
import { LLMName } from '../../utils/llms.js';
import { InitializeEmbeddings, Model } from '../../utils/embeddings.js';
import { PipelineConsolidator } from './consolidator.js';
import { DefinitionGenerator } from './definition-generator.js';
import { RefineMerger } from './refine-merger.js';
import { CategoryMerger } from './category-merger.js';
import { CategoryNameMerger } from './category-name-merger.js';
import { SimpleNameMerger } from './simple-name-merger.js';
import { CategoryRefiner } from './category-refiner.js';
import { CategoryAssigner } from './category-assigner.js';

await UseLLMs(async () => {
    InitializeEmbeddings("gecko-768-similarity");
    await ConsolidateConversations(new PipelineConsolidator(
        // Merge very similar names
        new SimpleNameMerger(),
        // Generate definitions for missing ones
        new DefinitionGenerator(),
        // Merge definitions
        // This is really a step that tries to emulate human workflow. 
        // My heuristics: we start from closer ideas, then try to merge distance ones, before give some final touches
        new RefineMerger({ Threshold: 0.5, Penalty: 0, UseDefinition: false }),
        new RefineMerger({ Threshold: 0.5, Penalty: 0, Looping: true }),
        new RefineMerger({ Threshold: 0.7, Penalty: 0.1, UseDefinition: false }),
        new RefineMerger({ Threshold: 0.7, Penalty: 0.1 }),
        new RefineMerger({ Threshold: 0.5, Penalty: 0, Looping: true }),
        // Merge categories
        new CategoryNameMerger(),
        new CategoryMerger({ Looping: true, Threshold: 0.7, Penalty: 0.1 }),
        new CategoryNameMerger(),
        new CategoryRefiner(),
        // Assign categories to codes
        new CategoryAssigner()
    ), "Users of Physics Lab (Group 1)", "0~17-gpt-3.5-turbo.json", "low-level-3", "llama3-70b", false);
}, "gpt-4.5-turbo"); // 

process.exit(0);