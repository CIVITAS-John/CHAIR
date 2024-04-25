import { UseLLMs } from '../translation/general.js';
import { ConsolidateConversations } from './codebooks/codebooks.js';
import { LLMName } from '../utils/llms.js';
import { Consolidator1 } from './codebooks/consolidator-1.js';
import { InitializeEmbeddings } from '../utils/embeddings.js';

InitializeEmbeddings("gecko-768");
await UseLLMs(async () => {
    await ConsolidateConversations(new Consolidator1(), "Users of Physics Lab (Group 1)", "0~17-gpt-3.5-turbo.json", "low-level-3", LLMName, false);
    // await ConsolidateConversations(new Consolidator1(), "Users of Physics Lab (Group 2)", "0~16-gpt-3.5-turbo.json", "low-level-3", LLMName, false);
}, "gpt-3.5-turbo");

process.exit(0);