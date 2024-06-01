// Schema for the dataset.
import { GetSpeakerNameForExample } from "../constants.js";

/** Dataset: A dataset for the qualitative analysis. */
export interface Dataset<T extends DataChunk<DataItem>> {
    /** Title: The title of the dataset. */
    Title: string;
    /** Description: The description of the dataset. */
    Description: string;
    /** ResearchQuestion: The research question of the dataset. */
    ResearchQuestion: string;
    /** CodingNotes: The coding notes of the dataset. */
    CodingNotes: string;
    /** Data: The data chunks in the dataset. */
    Data: Record<string, Record<string, T>>;
    /** GetSpeakerName: Get the speaker name from the user ID. */
    GetSpeakerName: (UserID: string) => string;
}

/** CodedThreads: A collection of qualitatively coded threads. */
export interface CodedThreads {
    /** Threads: The qualitatively coded threads. */
    Threads: Record<string, CodedThread>;
    /** Codebook?: The summarized codebook. */
    Codebook?: Codebook;
}

/** CodedThread: A qualitatively coded thread (e.g. a project, a conversation). */
// Depending on the context, each prompt/ways of coding may use some or all of the following fields.
export interface CodedThread {
    /** ID: The ID of the item. */
    ID: string;
    /** Summary: Summary of the thread. */
    Summary?: string;
    /** Plan: Plans before the coding. */
    Plan?: string;
    /** Reflection: Reflections after the coding. */
    Reflection?: string;
    /** Codes: The codes used in the coding. */
    Codes: Codebook;
    /** Items: Coded items in the thread. */
    Items: Record<string, CodedItem>;
    /** Iteration: The iteration of the coding. */
    Iteration?: number;
}

/** CodedItem: A qualitatively coded item (e.g. a comment, a message). */
// Depending on the context, each prompt/ways of coding may use some or all of the following fields.
export interface CodedItem {
    /** ID: The ID of the item. */
    ID: string;
    /** Codes: Qualitative codes on the item. */
    Codes?: string[];
}

/** CodebookComparison: A package for comparing codebooks. */
export interface CodebookComparison<T extends DataChunk<DataItem>> {
    /** Source: The underlying dataset of the codebooks. */
    Source: Dataset<T>;
    /** Codebooks: The codebooks to compare with. */
    Codebooks: Codebook[];
    /** Names: The names of the codebooks. */
    Names: string[];
    /** Codes: The codes in the combined codebook. */
    Codes: Code[];
    /** Distances: The distance matrix between codes in the first codebook. */
    Distances: number[][];
}

/** Codebook: A codebook for the qualitative codes. */
export interface Codebook extends Record<string, Code> {

}

/** GetCategories: Get the categories from the codebook. */
export function GetCategories(Codebook: Codebook): Map<string, string[]> {
    var Categories = new Map<string, string[]>();
    for (var Code of Object.values(Codebook)) {
        for (var Category of Code.Categories ?? []) {
            if (Category == "") continue;
            if (!Categories.has(Category)) Categories.set(Category, []);
            if (Categories.get(Category)!.indexOf(Code.Label) == -1)
                Categories.get(Category)!.push(Code.Label);
        }
    }
    return Categories;
}

/** CodebookEvaluation: Evaluation of a codebook. */
export interface CodebookEvaluation extends Record<string, number> {

}

/** Code: A qualitative code. */
export interface Code {
    /** Label: The label of the code. */
    Label: string;
    /** Categories: Categories of the code. */
    Categories?: string[];
    /** Definitions: Definitions of the code. */
    Definitions?: string[];
    /** Examples: Examples of the code. */
    Examples?: string[];
    /** Alternatives: Alternative labels of the code. */
    Alternatives?: string[];
    /** OldLabels: Temporary, old labels of the code. Only used in consolidation. */
    OldLabels?: string[];
    /** Owners: Owner codebooks of the code. Only used in evaluation. */
    Owners?: number[];
    /** Position: Visual position of the code. Only used in evaluation. */
    Position?: [number, number];
}

/** AssembleExample: Assemble an example. */
export function AssembleExample(ID: string, UserID: string, Content: string){
    return `${ID}|||${GetSpeakerNameForExample(UserID)}: ${Content}`;
}

/** AssembleExampleFrom: Assemble an example from a data item. */
export function AssembleExampleFrom(Item: DataItem) {
    return AssembleExample(Item.ID, Item.UserID, Item.Content);
}

/** DataChunk: A chunk of data. */
export interface DataChunk<T extends DataItem> {
    /** ID: The ID of the chunk. */
    ID: string;
    /** AllItems: All items in the chunk. */
    AllItems?: T[];
    /** Items: The number of items in the chunk. */
    Items: number;
    /** Mentions: The participants that this chunk mentioned. */
    Mentions?: string[];
}

/** DataItem: An item in a dataset. */
export interface DataItem {
    /** ID: The ID of the item. */
    ID: string;
    /** UserID: The sender ID of the item. */
    UserID: string;
    /** Nickname: The nickname of the sender. */
    Nickname: string;
    /** Time: The time the item was sent. */
    Time: Date;
    /** Content: The content of the item. */
    Content: string;
    /** Chunk: The chunk id of the item. */
    Chunk?: string;
    /** Mentions: The participants that this item mentioned. */
    Mentions?: string[];
}

/** Conversation: A segment of the group chat. */
export interface Conversation extends DataChunk<Message> {
    /** Start: The time the conversation started. */
    Start: Date;
    /** End: The time the conversation ended. */
    End: Date;
    /** Participants: The participants in the conversation. */
    Participants: Map<string, number>;
    /** FirstSeen: The number of first-time participants. */
    FirstSeen: number;
}

/** Message: A message in a group chat. */
export interface Message extends DataItem {
    /** FirstSeen: Whether the sender is first seen in the group. */
    FirstSeen?: boolean;
}

/** Participant: A participant in a group chat. */
export interface Participant {
    /** ID: The ID of the participant. */
    ID: string;
    /** Nickname: The initial nickname of the participant. */
    Nickname: string;
    /** Messages: The number of messages sent by the participant. */
    Messages: number;
    /** FirstSeen: The time the participant first appeared in the group. */
    FirstSeen: Date;
}

/** Message: A message in a group chat. */
export interface Project extends DataChunk<Comment>, DataItem {
    /** Category: The category of the project. */
    Category: string;
    /** CurrentNickname: The current nickname at the time of sharing. */
    CurrentNickname?: string;
    /** Title: Title of the project. */
    Title: string;
    /** Tags: Tags of the project. */
    Tags: string[];
    /** Visits: Number of total visits (until now, not the cutoff date). */
    Visits: number;
    /** Stars: Number of total stars (until now, not the cutoff date). */
    Stars: number;
    /** Supports: Number of total supports (until now, not the cutoff date). */
    Supports: number;
    /** Remixes: Number of total remixes (until now, not the cutoff date). */
    Remixes: number;
    /** Cover: The cover image of the project. */
    Cover: string,
}

/** Comment: A comment on a project or a user. */
export interface Comment extends DataItem {
    /** CurrentNickname: The current nickname at the time of posting. */
    CurrentNickname?: string;
}

/** User: A user in Physics Lab. */
export interface User {
    /** ID: The ID of the user. */
    ID: string;
    /** Nickname: The initial nickname of the user. */
    Nickname: string;
    /** Projects: The number of projects sent by the user. */
    Projects: number;
    /** Comments: The number of comments sent by the user. */
    Comments: number;
    /** FirstUse: The time the user first used the app. */
    FirstUse: Date;
    /** FirstProject: The time the user first shared a project in the community. */
    FirstProject?: Date;
    /** FirstComment: The time the user first commented in the community. */
    FirstComment?: Date;
    /** Banned: Whether the user is, or was, banned. */
    Banned?: boolean;
    /** Oldtimer: Whether the user is, or was, an old-timer. */
    Oldtimer?: boolean;
    /** Moderator: Whether the user is, or was, a moderator. */
    Moderator?: boolean;
    /** Titles: Titles held by the user. */
    Titles: [Date, string][];
    /** Messages: Messages on the profile. */
    Messages?: Comment[];
}