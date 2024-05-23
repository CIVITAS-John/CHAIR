import * as File from 'fs';
import { UseLLMs } from '../../translation/general.js';
import { ProcessConversations } from './conversations.js';
import { LowLevelAnalyzer3 } from './low-level-3.js';

await UseLLMs(async () => {
    await ProcessConversations(new LowLevelAnalyzer3(), "Coded Dataset 1", "0~16-gpt-4.5-omni.json", false);
    // await ProcessConversations(new LowLevelAnalyzer3(), "Coded Dataset 2", "0~17-gpt-4.5-omni.json", false);
}, "llama3-70b_1", "llama3-70b_2", "llama3-70b_3", "llama3-70b_4", "llama3-70b_5"); // "gpt-3.5-turbo", "gpt-4.5-turbo", "gpt-4.5-omni", "llama3-70b", "claude3-haiku", "claude3-sonnet"

process.exit(0);