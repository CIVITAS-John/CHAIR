import { RequestLLMWithCache } from '../../utils/llms.js';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { CodedThread, Conversation } from '../../utils/schema.js';
import { Analyzer } from '../analyzer.js';
import { Message } from '../../utils/schema';

/** AnalyzeConversations: Analyze the conversations. */
export async function AnalyzeConversations(Analyzer: Analyzer<Conversation>, Conversations: Record<string, Conversation>, Analyzed: Record<string, CodedThread> = {}, FakeRequest: boolean = false): Promise<Record<string, CodedThread>> {
    // Run the prompt over each conversation
    for (const [Key, Conversation] of Object.entries(Conversations)) {
        // Get the messages
        var Messages = Conversation.AllMessages!;
        console.log(`Conversation ${Key}: ${Messages.length} messages`);
        // Initialize the analysis
        var Analysis: CodedThread = Analyzed[Key];
        if (!Analysis) {
            Analysis = { ID: Key, Items: {} };
            Messages.forEach(Message => Analysis.Items[Message.ID] = { ID: Message.ID });
            Analyzed[Key] = Analysis;
        } 
        // Build the prompts
        var Prompts = Analyzer.BuildPrompts(Conversation, Analysis, Messages);
        // Run the prompts
        var Tries = 0;
        while (true) {
            try {
                var Response = await RequestLLMWithCache([ new SystemMessage(Prompts[0]), new HumanMessage(Prompts[1]) ], 
                    `messaging-groups/${Analyzer.Name}`, Tries * 0.2, FakeRequest);
                var ItemResults = Analyzer.ParseResponse(Response.split("\n").map(Line => Line.trim()), Analysis);
                for (const [Index, Result] of Object.entries(ItemResults)) {
                    Analysis.Items[Messages[parseInt(Index) - 1].ID].Codes = 
                        Result.split(',').map(Code => Code.trim().replace(/\.$/, "").toLowerCase()).filter(Code => Code.length > 0);
                }
                break;
            } catch (Error: any) {
                if (++Tries > 2) throw Error;
                console.log(`Analysis error ${Error.message}, retrying ${Tries} times.`);
            }
        }
    }
    return Analyzed;
}

/** BuildMessagePrompt: Build a prompt segment with a message. */
export function BuildMessagePrompt(Message: Message): string {
    var Content = Message.Content.replaceAll(/@(.*?)\((\d+)\)([^\w]|$)/g, (Match, Name, ID) => {
        if (ID == "3") return `@Designer `;
        return `@P${ID} `;
    });
    return `${Message.SenderID == "3" ? "Designer" : "P" + Message.SenderID}: ${Content}`;
}