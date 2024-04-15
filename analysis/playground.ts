import * as File from 'fs';
import { UseLLM } from '../translation/general.js';
import { AnalyzeConversations, ProcessConversations } from './messaging-groups/conversations.js';
import { LowLevelAnalyzer1 } from './messaging-groups/low-level-1.js';
import { LLMName } from '../utils/llms.js';

// Unfortunately, gpt-3.5-turbo seems too weak to handle the analysis
// It keeps forgetting some of the messages
UseLLM("gpt-3.5-turbo");
// UseLLM("claude3-haiku");
await ProcessConversations(new LowLevelAnalyzer1(), "Users of Physics Lab (Group 1)", "0~17-gpt-3.5-turbo.json");
await ProcessConversations(new LowLevelAnalyzer1(), "Users of Physics Lab (Group 2)", "0~16-gpt-3.5-turbo.json");

process.exit(0);