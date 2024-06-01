// Data loader from exported JSON or spreadsheet files
import * as File from 'fs';
import * as Path from 'path';
import * as dotenv from 'dotenv';
import chalk from 'chalk';
import Excel from 'exceljs';
import { GetFilesRecursively, RemoveCommonality } from './file.js';
import { CodedThread, CodedThreads, Code, CodedItem, Conversation, Message, Participant, Project, AssembleExample, Codebook, DataChunk, DataItem, Dataset } from "./schema.js";
import { MergeCodebook, MergeCodebooks } from "../analysis/codebooks/codebooks.js";

/** GetDatasetPath: Get the dataset path. */
export function GetDatasetPath(): string {
    dotenv.config();
    return process.env.DATASET_PATH ?? "{not set}";
}

/** LoadProjects: Load the projects. */
export function LoadProjects(): Project[] {
    const Projects: Project[] = JSON.parse(File.readFileSync(GetProjectsPath("Projects.json"), 'utf-8'));
    Projects.forEach(Project => {
        Project.Time = new Date(Date.parse(Project.Time as any));
        if (Project.AllItems)
            Project.AllItems.forEach(Comment => Comment.Time = new Date(Date.parse(Comment.Time as any)));
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

/** LoadDataset: Load a dataset for analysis. */
export function LoadDataset<T extends DataChunk<DataItem>>(Group: string): Dataset<T> {
    var Result = eval(`(function() {${File.readFileSync(GetMessagesPath(Group, "configuration.js"), 'utf-8')}})()`) as Dataset<T>;
    for (var [Key, Value] of Object.entries(Result.Data)) {
        Result.Data[Key] = LoadChunksForAnalysis<T>(Group, Value as any);
    }
    return Result;
}

/** LoadChunksForAnalysis: Load the chunks for analysis. */
export function LoadChunksForAnalysis<T extends DataChunk<DataItem>>(Group: string, Name: string): Record<string, T> {
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
    throw new Error("Unsupported or non-existent file: " + Source + ".");
}

/** LoadParticipants: Load the participants. */
export function LoadParticipants(): Participant[] {
    return JSON.parse(File.readFileSync(GetParticipantsPath("Participants.json"), 'utf-8'));
}

/** GetProjectsPath: Get the saving path of certain projects. */
export function GetProjectsPath(Name: string): string { 
    return `${GetDatasetPath()}/Projects and Comments/${Name}`; 
}

/** GetMessagesPath: Get the saving path of certain messages. */
export function GetMessagesPath(Group: string, Name?: string): string { 
    return `${GetDatasetPath()}/Messaging Groups/${Group}${Name ? "/" + Name : ""}`; 
}

/** GetParticipantsPath: Get the saving path of messaging group participants. */
export function GetParticipantsPath(Name: string): string { 
    return `${GetDatasetPath()}/Messaging Groups/${Name}`; 
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
        var IDIndex = -1, SpeakerIndex = -1, ContentIndex = -1, CodeIndex = -1;
        // Iterate through the rows
        Sheet.eachRow((Row, RowNumber) => {
            if (Row.number == 1) {
                Row.eachCell((Cell, ColumnNumber) => {
                    var Value = Cell.value;
                    if (Value == "ID") IDIndex = ColumnNumber;
                    if (Value == "Content") ContentIndex = ColumnNumber;
                    if (Value == "SID") SpeakerIndex = ColumnNumber;
                    if (Value == "Codes") CodeIndex = ColumnNumber;
                });
                return;
            }
            // Get the ID
            if (IDIndex == -1) return;
            var ID = Row.getCell(IDIndex)?.value;
            if (!ID) return;
            var Content = Row.getCell(ContentIndex)?.value?.toString()?.trim() ?? "";
            var Speaker = Row.getCell(SpeakerIndex)?.value?.toString()?.trim() ?? "";
            ID = ID.toString();
            switch (ID) {
                case "-1": // Summary
                    Thread.Summary = Content;
                    if (Thread.Summary == "" || Thread.Summary.startsWith("(Optional) Your thoughts before coding")) 
                        Thread.Summary = undefined;
                    break;
                case "-2": // Plan
                    Thread.Plan = Content;
                    if (Thread.Plan == "" || Thread.Plan.startsWith("The summary of")) 
                        Thread.Plan = undefined;
                    break;
                case "-3": // Reflection
                    Thread.Reflection = Content;
                    if (Thread.Reflection == "" || Thread.Reflection.startsWith("Your reflections after coding")) 
                        Thread.Reflection = undefined;
                    break;
                default: // Coded item
                    // if (ID.indexOf("-") == -1) ID = "2-" + ID; // A hack for the first coded dataset.
                    var Item: CodedItem = { ID: ID, Codes: [] };
                    var Codes = Row.getCell(CodeIndex)?.value;
                    if (Codes && typeof Codes == "string") 
                        Item.Codes = Codes.split(/,|\||;/g).map(Code => Code.trim().replace(/\.$/, "").toLowerCase()).filter(Code => Code !== "");
                    for (var Code of Item.Codes!) {
                        var Current: Code = Thread.Codes![Code] ?? { Label: Code, Examples: [] };
                        Thread.Codes![Code] = Current;
                        var ContentWithID = AssembleExample(ID, Speaker, Content);
                        if (Content !== "" && !Current.Examples!.includes(ContentWithID))
                            Current.Examples!.push(ContentWithID);
                    }
                    Thread.Items[ID] = Item;
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

/** LoadCodebooks: Load codebooks from a source. */
export async function LoadCodebooks(Source: string | string[]): Promise<[Codebook[], string[]]> {
    // Load potential paths
    var Sources: string[] = [];
    if (typeof(Source) == "string") {
        Sources = GetFilesRecursively(Source);
    } else {
        Sources = Source.map(Source => GetFilesRecursively(Source)).flat();
    }
    // Remove the in-process codebooks
    Sources = Sources.filter(Source => !Source.match(/\-(\d)+.xlsx$/g)).sort();
    // Load the codebooks
    var Codebooks: Codebook[] = [];
    var Names: string[] = [];
    for (var Current of Sources) {
        var Name = Current.substring(0, Current.length - Path.extname(Current).length);
        if (Names.includes(Name)) continue;
        var Codebook = await LoadCodebook(Current);
        if (Codebook) {
            Codebooks.push(Codebook);
            Names.push(Name);
        }
    }
    // Remove commonality
    Names = RemoveCommonality(Names);
    console.log(chalk.green(`Statistics: Loaded ${Codebooks.length} codebooks.`));
    return [Codebooks, Names];
}

/** LoadCodebooksInGroups: Load codebooks in folders and simply merge them into one group per folder. */
export async function LoadCodebooksInGroups(Paths: string[]): Promise<[Codebook[], string[]]> {
    var Codebooks: Codebook[] = [];
    // Load the codebooks
    for (var Path of Paths) {
        var [ CurrentCodebooks, CurrentNames ] = await LoadCodebooks(Path);
        Codebooks.push(MergeCodebooks(CurrentCodebooks));
    }
    // Remove commonality
    Paths = RemoveCommonality(Paths);
    return [Codebooks, Paths];
}

/** LoadCodebook: Load a codebook from a file. */
export async function LoadCodebook(Current: string): Promise<Codebook | undefined> {
    if (Current.endsWith(".json")) {
        var Content = File.readFileSync(`${Current}`, 'utf8');
        var Parsed = JSON.parse(Content);
        if (Parsed.Codebook) {
            console.log(`Loading ${Current} as coded threads.`)
            return Parsed.Codebook;
        } else if (!Parsed.Threads) {
            console.log(`Loading ${Current} as a codebook.`)
            return Parsed;
        } else {
            console.log(`Skipping ${Current} because it is not a codebook.`);
        }
    } else if (Current.endsWith(".xlsx")) {
        if (Current.startsWith("~")) return;
        console.log(`Loading ${Current} as an Excel workbook.`);
        return (await LoadCodedConversations(Current)).Codebook!;
    }
}