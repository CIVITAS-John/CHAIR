import * as File from 'fs';
import { UseLLMs } from '../translation/general.js';
import { ProcessConversations } from './messaging-groups/conversations.js';
import { HighLevelAnalyzer1 } from './messaging-groups/high-level-1.js';

await UseLLMs(async () => {
    await ProcessConversations(new HighLevelAnalyzer1(), "Users of Physics Lab (Group 1)", "0~17-gpt-3.5-turbo.json", false);
    // await ProcessConversations(new HighLevelAnalyzer1(), "Users of Physics Lab (Group 2)", "0~16-gpt-3.5-turbo.json", true);
}, "gpt-3.5-turbo", "llama3-70b");

process.exit(0);