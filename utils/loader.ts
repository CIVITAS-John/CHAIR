// Data loader from exported JSON files
import * as File from 'fs';
import * as Path from 'path';
import { CodedThread, CodedThreads, Code, CodedItem, Conversation, Message, Participant, Project } from "./schema.js";
import { DatasetPath } from '../constants.js';
import { MergeCodebook } from "../analysis/codebooks/codebooks.js";
import Excel from 'exceljs';

/** LoadProjects: Load the projects. */
export function LoadProjects(): Project[] {
    const Projects: Project[] = JSON.parse(File.readFileSync(GetProjectsPath("Projects.json"), 'utf-8'));
    Projects.forEach(Project => {
        Project.Time = new Date(Date.parse(Project.Time as any));
        if (Project.Comments)
            Project.Comments.forEach(Comment => Comment.Time = new Date(Date.parse(Comment.Time as any)));
    });
    return Projects;
}

/** LoadMessages: Load the chat messages. */
export function LoadMessages(Group: string): Message[] {
    const Messages: Message[] = JSON.parse(File.readFileSync(GetMessagesPath(Group, "Messages.json"), 'utf-8'));
    Messages.forEach(Message => {
        Message.Time = new Date(Date.parse(Message.Time as any));
    });
    return Messages;
}

/** LoadConversations: Load the conversations. */
export function LoadConversations(Group: string): Conversation[] {
    return JSON.parse(File.readFileSync(GetMessagesPath(Group, "Conversations.json"), 'utf-8'));
}

/** LoadConversationsForAnalysis: Load the conversations for analysis. */
export function LoadConversationsForAnalysis(Group: string, Name: string): Record<string, Conversation> {
    return JSON.parse(File.readFileSync(GetMessagesPath(Group, Name), 'utf-8'));
}

/** LoadAnalyses: Load analyzed threads from either JSON or Excel. */
export async function LoadAnalyses(Source: string): Promise<CodedThreads> {
    var Extname = Path.extname(Source);
    if (Extname !== ".json" && Extname !== ".xlsx") {
        // Try to find the json
        if (File.existsSync(Source + ".json")) Source += ".json";
        else if (File.existsSync(Source + ".xlsx")) Source += ".xlsx";
    }
    if (Source.endsWith(".json")) return JSON.parse(File.readFileSync(Source, 'utf-8'));
    if (Source.endsWith(".xlsx")) return await LoadCodedConversations(Source);
    throw new Error("Unsupported file format.");
}

/** LoadParticipants: Load the participants. */
export function LoadParticipants(): Participant[] {
    return JSON.parse(File.readFileSync(GetParticipantsPath("Participants.json"), 'utf-8'));
}

/** GetProjectsPath: Get the saving path of certain projects. */
export function GetProjectsPath(Name: string): string { 
    return `${DatasetPath}/Projects and Comments/${Name}`; 
}

/** GetMessagesPath: Get the saving path of certain messages. */
export function GetMessagesPath(Group: string, Name?: string): string { 
    return `${DatasetPath}/Messaging Groups/${Group}${Name ? "/" + Name : ""}`; 
}

/** GetParticipantsPath: Get the saving path of messaging group participants. */
export function GetParticipantsPath(Name: string): string { 
    return `${DatasetPath}/Messaging Groups/${Name}`; 
}

/** LoadCodedConversations: Import coding results from an Excel workbook. */
export async function LoadCodedConversations(FilePath: string): Promise<CodedThreads> {
    var Workbook = new Excel.Workbook();
    await Workbook.xlsx.readFile(FilePath);
    return ImportCodedConversations(Workbook);
}

/** ImportCodedConversations: Import coding results from an Excel workbook. */
export function ImportCodedConversations(Spreadsheet: Excel.Workbook): CodedThreads {
    var Threads: CodedThreads = { Threads: {}, Codebook: {} };
    // Iterate through the worksheets
    for (var Sheet of Spreadsheet.worksheets) {
        var Thread: CodedThread = { 
            ID: Sheet.name,
            Codes: {},
            Items: {},
        };
        var IDIndex = -1, ContentIndex = -1, CodeIndex = -1;
        // Iterate through the rows
        Sheet.eachRow((Row, RowNumber) => {
            if (Row.number == 1) {
                Row.eachCell((Cell, ColumnNumber) => {
                    var Value = Cell.value;
                    if (Value == "ID") IDIndex = ColumnNumber;
                    if (Value == "Content") ContentIndex = ColumnNumber;
                    if (Value == "Codes") CodeIndex = ColumnNumber;
                });
                return;
            }
            // Get the ID
            if (IDIndex == -1) return;
            var ID = Row.getCell(IDIndex)?.value;
            if (!ID || typeof ID != "number") return;
            var Content = Row.getCell(ContentIndex)?.value?.toString()?.trim() ?? "";
            switch (ID) {
                case -1: // Summary
                    Thread.Summary = Content;
                    if (Thread.Summary == "" || Thread.Summary == "(Optional) Your thoughts before coding the conversation.") 
                        Thread.Summary = undefined;
                    break;
                case -2: // Plan
                    Thread.Plan = Content;
                    if (Thread.Plan == "" || Thread.Plan == "The summary of the conversation.") 
                        Thread.Plan = undefined;
                    break;
                case -3: // Reflection
                    Thread.Reflection = Content;
                    if (Thread.Reflection == "" || Thread.Reflection == "Your reflections after coding the conversation.") 
                        Thread.Reflection = undefined;
                    break;
                default: // Coded item
                    var Item: CodedItem = { ID: ID.toString(), Codes: [] };
                    var Codes = Row.getCell(CodeIndex)?.value;
                    if (Codes && typeof Codes == "string") 
                        Item.Codes = Codes.split(/,|\||;/g).map(Code => Code.trim().replace(/\.$/, "").toLowerCase()).filter(Code => Code !== "");
                    for (var Code of Item.Codes!) {
                        var Current: Code = Thread.Codes![Code] ?? { Label: Code, Examples: [] };
                        Thread.Codes![Code] = Current;
                        if (Content !== "" && !Current.Examples!.find(Example => Example == Content))
                            Current.Examples!.push(Content);
                    }
                    Thread.Items[ID.toString()] = Item;
                    break;
            }
        });
        // Add the thread to the threads
        Threads.Threads[Thread.ID] = Thread;
    }
    // Merge the codebook
    MergeCodebook(Threads);
    return Threads;
}