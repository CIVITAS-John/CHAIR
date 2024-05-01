import { UseLLMs } from '../translation/general.js';
import { ConsolidateConversations } from './codebooks/codebooks.js';
import { LLMName } from '../utils/llms.js';
import { InitializeEmbeddings, Model } from '../utils/embeddings.js';
import { PipelineConsolidator } from './codebooks/consolidator.js';
import { NameMerger } from './codebooks/name-merger.js';
import { DefinitionGenerator } from './codebooks/definition-generator.js';
import { DefinitionMerger } from './codebooks/definition-merger.js';
import { CategoryMerger } from './codebooks/category-merger.js';
import { CategoryNameMerger } from './codebooks/category-name-merger.js';

await UseLLMs(async () => {
    InitializeEmbeddings("gecko-768-similarity");
    await ConsolidateConversations(new PipelineConsolidator(
        // Merge very similar names
        new NameMerger(),
        // Generate definitions for missing ones
        new DefinitionGenerator(),
        // Merge definitions
        new DefinitionMerger({ Looping: true }),
        // With a more lenient criteria to get fewer codes
        new NameMerger(),
        new DefinitionMerger({ Looping: true, Threshold: 0.6, Penalty: 0.05 }),
        // Merge categories
        new CategoryNameMerger(),
        new CategoryMerger({ Looping: true }),
        new CategoryNameMerger(),
    ), "Users of Physics Lab (Group 1)", "0~17-gpt-3.5-turbo.json", "low-level-3", LLMName, false);
}, "llama3-70b"); // 

process.exit(0);