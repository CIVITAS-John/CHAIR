import { UseLLMs } from '../translation/general.js';
import { ConsolidateConversations } from './codebooks/codebooks.js';
import { LLMName } from '../utils/llms.js';
import { Consolidator1 } from './codebooks/consolidator-1.js';
import { InitializeEmbeddings, Model } from '../utils/embeddings.js';

await UseLLMs(async () => {
    InitializeEmbeddings("gecko-768-similarity");
    await ConsolidateConversations(new Consolidator1(), "Users of Physics Lab (Group 1)", "0~17-gpt-3.5-turbo.json", "low-level-3", LLMName, false);
    // await ConsolidateConversations(new Consolidator1(), "Users of Physics Lab (Group 2)", "0~16-gpt-3.5-turbo.json", "low-level-3", LLMName, false);
}, "gpt-4.5-turbo", "claude3-haiku", "claude3-sonnet"); // 

process.exit(0);