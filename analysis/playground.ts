import * as File from 'fs';
import { LoadConversationsForFirstRound } from '../utils/loader.js';
import { UseLLM } from '../translation/general.js';
import { AnalyzeConversations } from './messaging-groups/conversations.js';
import { LowLevelAnalyzer1 } from './messaging-groups/low-level-1.js';

UseLLM("gpt-3.5-turbo");

// Load the conversations prepared for analysis
var Group = "Users of Physics Lab (Group 1)";
var Name = "0~17-gpt-3.5-turbo.json"
var Conversations = LoadConversationsForFirstRound(Group, Name);

// Analyze the conversations
var Result = await AnalyzeConversations(new LowLevelAnalyzer1(), Conversations, {}, true);
console.log(Result);
process.exit(0);