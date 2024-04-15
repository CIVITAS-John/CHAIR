import * as File from 'fs';
import { GetMessagesPath, LoadConversationsForFirstRound } from '../utils/loader.js';
import { UseLLM } from '../translation/general.js';
import { AnalyzeConversations } from './messaging-groups/conversations.js';
import { LowLevelAnalyzer1 } from './messaging-groups/low-level-1.js';
import { LLMName } from '../utils/llms.js';

// Unfortunately, gpt-3.5-turbo seems too weak to handle the analysis
// It keeps forgetting some of the messages
// UseLLM("gpt-3.5-turbo");
UseLLM("claude3-haiku");

// Load the conversations prepared for analysis
var Group = "Users of Physics Lab (Group 1)";
var Name = "0~17-gpt-3.5-turbo.json"
var Conversations = LoadConversationsForFirstRound(Group, Name);

// Analyze the conversations
var Result = await AnalyzeConversations(new LowLevelAnalyzer1(), Conversations, {}, false);
// Write the result into a JSON file
File.writeFileSync(GetMessagesPath(Group, `Conversations/${Name}-${LLMName}.json`), JSON.stringify(Result, null, 4));
// Write the result into an Excel file
process.exit(0);