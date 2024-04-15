import * as File from 'fs';
import { UseLLMs } from '../translation/general.js';
import { ProcessConversations } from './messaging-groups/conversations.js';
import { LowLevelAnalyzer1 } from './messaging-groups/low-level-1.js';

await UseLLMs(async () => {
    await ProcessConversations(new LowLevelAnalyzer1(), "Users of Physics Lab (Group 1)", "0~17-gpt-3.5-turbo.json");
    await ProcessConversations(new LowLevelAnalyzer1(), "Users of Physics Lab (Group 2)", "0~16-gpt-3.5-turbo.json");
}, "gpt-3.5-turbo");
// UseLLM("claude3-haiku");

process.exit(0);