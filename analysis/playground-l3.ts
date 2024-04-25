import * as File from 'fs';
import { UseLLMs } from '../translation/general.js';
import { ProcessConversations } from './messaging-groups/conversations.js';
import { LowLevelAnalyzer3 } from './messaging-groups/low-level-3.js';

await UseLLMs(async () => {
    await ProcessConversations(new LowLevelAnalyzer3(), "Users of Physics Lab (Group 1)", "0~17-gpt-3.5-turbo.json", false);
    await ProcessConversations(new LowLevelAnalyzer3(), "Users of Physics Lab (Group 2)", "0~16-gpt-3.5-turbo.json", false);
}, "gpt-3.5-turbo"); // , "claude3-haiku", "claude3-sonnet"

process.exit(0);