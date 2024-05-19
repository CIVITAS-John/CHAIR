import * as File from 'fs';
import { UseLLMs } from '../../translation/general.js';
import { ProcessConversations } from './conversations.js';
import { HighLevelAnalyzer1 } from './high-level-1.js';

// GPT-3.5-turbo is not capable of this. 
// It will guarantee codes related to persons, which is not desired.

await UseLLMs(async () => {
    await ProcessConversations(new HighLevelAnalyzer1(), "Coded Dataset 2", "0~17-gpt-4.5-omni.json", false);
    await ProcessConversations(new HighLevelAnalyzer1(), "Coded Dataset 1", "0~16-gpt-4.5-omni.json", false);
}, "gpt-4.5-turbo", "gpt-4.5-omni", "llama3-70b", "claude3-haiku", "claude3-sonnet");

process.exit(0);