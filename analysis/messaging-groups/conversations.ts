import * as File from 'fs';
import { GetMessagesPath } from '../../utils/loader.js';
import { EnsureFolder, LLMName, RequestLLMWithCache } from '../../utils/llms.js';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { CodedThread, CodedThreads, Conversation, Message } from '../../utils/schema.js';
import { Analyzer, LoopThroughChunks } from '../analyzer.js';
import { LoadConversationsForAnalysis } from '../../utils/loader.js';
import { ExportConversationsForCoding } from '../../utils/export.js';
import { MergeCodebook } from '../codebooks/codebooks.js';

/** ConversationAnalyzer: The definition of an abstract conversation analyzer. */
export abstract class ConversationAnalyzer extends Analyzer<Conversation, Message, CodedThread> {
}

/** ProcessConversations: Load, analyze, and export conversations. */
export async function ProcessConversations(Analyzer: ConversationAnalyzer, Group: string, ConversationName: string, FakeRequest: boolean = false) {
    var Conversations = LoadConversationsForAnalysis(Group, ConversationName);
    // Analyze the conversations
    var Result = await AnalyzeConversations(Analyzer, Conversations, { Threads: {} }, FakeRequest);
    // Write the result into a JSON file
    EnsureFolder(GetMessagesPath(Group, `Conversations/${Analyzer.Name}`));
    File.writeFileSync(GetMessagesPath(Group, `Conversations/${Analyzer.Name}/${ConversationName.replace(".json", "")}-${LLMName}.json`), JSON.stringify(Result, null, 4));
    // Write the result into an Excel file
    var Book = ExportConversationsForCoding(Object.values(Conversations), Result);
    await Book.xlsx.writeFile(GetMessagesPath(Group, `Conversations/${Analyzer.Name}/${ConversationName.replace(".json", "")}-${LLMName}.xlsx`));
}

/** AnalyzeConversations: Analyze the conversations. */
export async function AnalyzeConversations(Analyzer: ConversationAnalyzer, Conversations: Record<string, Conversation>, Analyzed: CodedThreads = { Threads: {} }, FakeRequest: boolean = false): Promise<CodedThreads> {
    // Run the prompt over each conversation
    for (const [Key, Conversation] of Object.entries(Conversations)) {
        // Get the messages
        var Messages = Conversation.AllMessages!;
        console.log(`Conversation ${Key}: ${Messages.length} messages`);
        // Initialize the analysis
        var Analysis: CodedThread = Analyzed.Threads[Key];
        if (!Analysis) {
            Analysis = { ID: Key, Items: {}, Iteration: 0, Codes: {} };
            Messages.forEach(Message => Analysis.Items[Message.ID] = { ID: Message.ID });
            Analyzed.Threads[Key] = Analysis;
        }
        // Run the messages through chunks (as defined by the analyzer)
        await LoopThroughChunks(Analyzer, Analysis, Conversation, Messages, async (Currents, ChunkStart, IsFirst, Tries, Iteration) => {
            var Prompts = Analyzer.BuildPrompts(Analysis, Conversation, Currents, ChunkStart, Iteration);
            if (Prompts[0] == "" && Prompts[1] == "") return true;
            if (!IsFirst && Analysis.Summary) Prompts[1] = `Summary of the conversation until now: ${Analysis.Summary}\n${Prompts[1]}`;
            // Run the prompts
            var Response = await RequestLLMWithCache([ new SystemMessage(Prompts[0]), new HumanMessage(Prompts[1]) ], 
                `messaging-groups/${Analyzer.Name}`, Tries * 0.2 + Analyzer.BaseTemperature, FakeRequest);
            if (FakeRequest) return true;
            var ItemResults = Analyzer.ParseResponse(Analysis, Response.split("\n").map(Line => Line.trim()), Currents, ChunkStart, Iteration);
            for (const [Index, Result] of Object.entries(ItemResults)) {
                var Message = Currents[parseInt(Index) - 1];
                var Codes = Result.toLowerCase().split(/,|\||;/g).map(Code => Code.trim().replace(/\.$/, "").toLowerCase())
                    .filter(Code => Code != Message.Content.toLowerCase() && Code.length > 0);
                // Record the codes from line-level coding
                Analysis.Items[Message.ID].Codes = Codes;
                Codes.forEach(Code => {
                    var Current = Analysis.Codes[Code] ?? { Label: Code };
                    Current.Examples = Current.Examples ?? [];
                    if (Message.Content !== "" && !Current.Examples.includes(Message.Content)) 
                        Current.Examples.push(Message.Content);
                    Analysis.Codes[Code] = Current;
                });
            }
            return true;
        });
        Analysis.Iteration++;
    }
    // Consolidate a codebook
    MergeCodebook(Analyzed);
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