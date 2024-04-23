import { UseLLMs } from '../translation/general.js';
import { ConsolidateConversations } from './codebooks/codebooks.js';
import { LLMName } from '../utils/llms.js';
import { Consolidator1 } from './codebooks/consolidator-1.js';
import { InitializeEmbeddings } from '../utils/embeddings.js';

InitializeEmbeddings("openai-large-512");
await UseLLMs(async () => {
    await ConsolidateConversations(new Consolidator1(), "Users of Physics Lab (Group 1)", "0~17-gpt-3.5-turbo.json", "low-level-3", LLMName, false);
}, "claude3-haiku");

process.exit(0);