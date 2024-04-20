import { UseLLMs } from '../translation/general.js';
import { ConsolidateConversations } from './codebooks/codebooks.js';
import { LLMName } from '../utils/llms.js';
import { Consolidator1 } from './codebooks/consolidator-1.js';

await UseLLMs(async () => {
    await ConsolidateConversations(new Consolidator1(), "Users of Physics Lab (Group 1)", "0~17-gpt-3.5-turbo.json", "high-level-1", LLMName, false);
}, "gpt-3.5-turbo");

process.exit(0);