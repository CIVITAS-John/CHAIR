import * as File from 'fs';
import { UseLLMs } from '../../translation/general.js';
import { ProcessConversations } from './conversations.js';
import { HighLevelAnalyzer1 } from './high-level-1.js';

// GPT-3.5-turbo is not capable of this. 
// It will guarantee codes related to persons, which is not desired.

await UseLLMs(async () => {
    await ProcessConversations(new HighLevelAnalyzer1(), "Users of Physics Lab (Group 1)", "0~17-gpt-3.5-turbo.json", false);
    await ProcessConversations(new HighLevelAnalyzer1(), "Users of Physics Lab (Group 2)", "0~16-gpt-3.5-turbo.json", true);
}, "llama3-70b", "gpt-4.5-turbo", "claude3-haiku", "claude3-sonnet");

process.exit(0);