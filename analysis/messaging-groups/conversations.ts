import * as File from 'fs';
import { GetMessagesPath } from '../../utils/loader.js';
import { EnsureFolder, LLMName, MaxItems, RequestLLMWithCache } from '../../utils/llms.js';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { CodedThread, Conversation } from '../../utils/schema.js';
import { Analyzer } from '../analyzer.js';
import { Message } from '../../utils/schema';
import { LoadConversationsForAnalysis } from '../../utils/loader.js';
import { ExportConversationsForCoding } from '../../utils/export.js';

/** ProcessConversations: Load, analyze, and export conversations. */
export async function ProcessConversations(Analyzer: Analyzer<Conversation>, Group: string, ConversationName: string, FakeRequest: boolean = false) {
    var Conversations = LoadConversationsForAnalysis(Group, ConversationName);
    // Analyze the conversations
    var Result = await AnalyzeConversations(Analyzer, Conversations, {}, FakeRequest);
    // Write the result into a JSON file
    EnsureFolder(GetMessagesPath(Group, `Conversations/${Analyzer.Name}`));
    File.writeFileSync(GetMessagesPath(Group, `Conversations/${Analyzer.Name}/${ConversationName.replace(".json", "")}-${LLMName}.json`), JSON.stringify(Result, null, 4));
    // Write the result into an Excel file
    var Book = ExportConversationsForCoding(Object.values(Conversations), Result);
    await Book.xlsx.writeFile(GetMessagesPath(Group, `Conversations/${Analyzer.Name}/${ConversationName.replace(".json", "")}-${LLMName}.xlsx`));
}

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
            Analysis = { ID: Key, Items: {}, Iteration: 0, Codes: {} };
            Messages.forEach(Message => Analysis.Items[Message.ID] = { ID: Message.ID });
            Analyzed[Key] = Analysis;
        }
        // Split messages into smaller chunks based on the maximum items
        var Cursor = 0;
        while (Cursor < Messages.length) {
            var Tries = 0;
            while (true) {
                // Get the chunk size
                var RecommendedSize = MaxItems - 2 - Tries;
                var ChunkSize = Analyzer.GetChunkSize(RecommendedSize, Messages.length - Cursor);
                if (typeof ChunkSize == "number") {
                    if (ChunkSize == RecommendedSize) {
                        if (Cursor + ChunkSize >= Messages.length - 3)
                            ChunkSize = Messages.length - Cursor;
                    }
                    ChunkSize = [ChunkSize, 0, 0];
                }
                // Get the chunk
                var Start = Math.max(Cursor - ChunkSize[1], 0);
                var End = Math.min(Cursor + ChunkSize[0] + ChunkSize[2], Messages.length);
                var Currents = Messages.slice(Start, End);
                var Index = Cursor - Start;
                var IsFirst = Cursor == 0;
                var IsLast = Cursor + ChunkSize[0] >= Messages.length;
                // Build the prompts
                var Prompts = Analyzer.BuildPrompts(Conversation, Analysis, Currents, Index);
                if (!IsFirst && Analysis.Summary) Prompts[1] = `Summary of the conversation until now: ${Analysis.Summary}\n${Prompts[1]}`;
                // Run the prompts
                try {
                    var Response = await RequestLLMWithCache([ new SystemMessage(Prompts[0]), new HumanMessage(Prompts[1]) ], 
                        `messaging-groups/${Analyzer.Name}`, Tries * 0.2, FakeRequest);
                    if (FakeRequest) break;
                    var ItemResults = Analyzer.ParseResponse(Response.split("\n").map(Line => Line.trim()), Analysis, Currents, Index);
                    var AllCodes = Analysis.Codes["[All]"] ?? [];
                    for (const [Index, Result] of Object.entries(ItemResults)) {
                        var Message = Currents[parseInt(Index) - 1];
                        var Codes = Result.toLowerCase().split(/,|\|/g).map(Code => Code.trim().replace(/\.$/, "").toLowerCase())
                            .filter(Code => Code != Message.Content.toLowerCase() && Code.length > 0);
                        Analysis.Items[Message.ID].Codes = Codes;
                        Codes.forEach(Code => { if (AllCodes.indexOf(Code) == -1) AllCodes.push(Code); });
                    }
                    if (AllCodes.length > 0) Analysis.Codes["[All]"] = AllCodes;
                    break;
                } catch (Error: any) {
                    if (++Tries > 2) throw Error;
                    console.log(`Analysis error ${Error.message}, retrying ${Tries} times.`);
                }
            }
            // Move the cursor
            Cursor += ChunkSize[0];
        }
        Analysis.Iteration++;
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