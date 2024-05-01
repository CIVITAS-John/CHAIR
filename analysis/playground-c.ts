import { UseLLMs } from '../translation/general.js';
import { ConsolidateConversations } from './codebooks/codebooks.js';
import { LLMName } from '../utils/llms.js';
import { InitializeEmbeddings, Model } from '../utils/embeddings.js';
import { PipelineConsolidator } from './codebooks/consolidator.js';
import { DefinitionGenerator } from './codebooks/definition-generator.js';
import { RefineMerger } from './codebooks/refine-merger.js';
import { CategoryMerger } from './codebooks/category-merger.js';
import { CategoryNameMerger } from './codebooks/category-name-merger.js';
import { SimpleNameMerger } from './codebooks/simple-name-merger.js';

await UseLLMs(async () => {
    InitializeEmbeddings("gecko-768-similarity");
    await ConsolidateConversations(new PipelineConsolidator(
        // Merge very similar names
        new SimpleNameMerger(),
        // Generate definitions for missing ones
        new DefinitionGenerator(),
        new RefineMerger({ Threshold: 0.5, Penalty: 0.05, UseDefinition: false }),
        // Merge definitions
        // This is really a step that tries to emulate human workflow. 
        // My heuristics: we start from closer ideas, then try to merge distance ones, before give some final touches
        new RefineMerger({ Threshold: 0.5, Penalty: 0.05, Looping: true }),
        new RefineMerger({ Threshold: 0.7, Penalty: 0.1 }),
        new RefineMerger({ Threshold: 0.5, Penalty: 0.05, Looping: true }),
        // Merge categories
        new CategoryNameMerger(),
        new CategoryMerger({ Looping: true, Threshold: 0.7, Penalty: 0.1 }),
        new CategoryNameMerger(),
    ), "Users of Physics Lab (Group 1)", "0~17-gpt-3.5-turbo.json", "low-level-3", LLMName, false);
}, "llama3-70b"); // 

process.exit(0);