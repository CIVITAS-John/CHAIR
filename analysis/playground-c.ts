import { UseLLMs } from '../translation/general.js';
import { ConsolidateConversations } from './codebooks/codebooks.js';
import { LLMName } from '../utils/llms.js';
import { InitializeEmbeddings, Model } from '../utils/embeddings.js';
import { PipelineConsolidator } from './codebooks/consolidator.js';
import { NameMerger } from './codebooks/name-merger.js';
import { DefinitionGenerator } from './codebooks/definition-generator.js';

await UseLLMs(async () => {
    InitializeEmbeddings("gecko-768-similarity");
    await ConsolidateConversations(new PipelineConsolidator(
        new NameMerger(),
        new DefinitionGenerator(),
    ), "Users of Physics Lab (Group 1)", "0~17-gpt-3.5-turbo.json", "low-level-3", LLMName, false);
}, "llama3-70b"); // 

process.exit(0);