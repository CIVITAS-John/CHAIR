import * as File from 'fs';
import { GetMessagesPath } from '../utils/loader.js';
import { Message, Conversation } from '../utils/schema.js';
import { RequestLLM } from '../utils/llms.js';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { UseLLM } from '../translation/general.js';

UseLLM("gpt-3.5-turbo");

// Load the conversations prepared for analysis
var Group = "Users of Physics Lab (Group 2)";
var Name = "0~16-gpt-3.5-turbo.json"
var Conversations = JSON.parse(File.readFileSync(GetMessagesPath(Group, "Conversations/" + Name), 'utf-8')) as Record<string, Conversation>;

// Run the prompt over each conversation
for (const [Key, Conversation] of Object.entries(Conversations)) {
    var Messages = Conversation.AllMessages!;
    console.log(`Conversation ${Key}: ${Messages.length} messages`);
    console.log();
    // Build the system prompt
    var SystemPrompt = `
You are an expert in thematic analysis. Now, you are working on the open coding.
This conversation comes from Physics Lab's online messaging groups. The goal is to identify low-level themes of each message.
The research question is: How did Physics Lab's online community emerge?
If the message does not belong to the conversation, generate "Skipped" as the theme.
Always follow the output format:
---
Thoughts: {Thoughts about the conversation. How are you going to code the data?}
{ID}. Low-level themes of the message, focus on social interactions, seperated by commas
Notes: {Note about the conversation. What did you find from the data?}`.trim();
    var HumanPrompt = Messages.map((Message, Index) => `${Index + 1}. ${Message.SenderID == "3" ? "Founder" : "P" + Message.SenderID}: ${Message.Content}`).join("\n");
    var Response = await RequestLLM([ new SystemMessage(SystemPrompt), new HumanMessage(HumanPrompt) ]);
    break;
}