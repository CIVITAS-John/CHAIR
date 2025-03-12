/** An item in a dataset (e.g. a message). */
export interface DataItem {
    /** The ID of the item. */
    id: string;
    /** The sender ID of the item. */
    userID: string;
    /** The nickname of the sender. */
    nickname: string;
    /** The time the item was sent. */
    time: Date;
    /** The content of the item. */
    content: string;
    /** The chunk id of the item. */
    chunk?: string;
    /** The participants that this item mentioned. */
    mentions?: string[];
    /** Extra qualitative tags on the item. */
    tags?: string[];
}

/** An unloaded JSON representation of a data item. */
export interface RawDataItem extends DataItem {
    time: string;
}

/** A chunk of data items. */
export interface DataChunk<T extends DataItem> {
    /** The ID of the chunk. */
    id: string;
    /** Data items in the chunk. */
    items?: (T | DataChunk<T>)[];
    /** The participants that this chunk mentioned. */
    mentions?: string[];
}

/** An unloaded JSON representation of a data chunk. */
export interface RawDataChunk extends DataChunk<RawDataItem> {
    items: (RawDataItem | RawDataChunk)[];
}

/** A dataset for qualitative analysis. */
export interface Dataset<T extends DataChunk> {
    /** The title of the dataset. */
    title: string;
    /** The description of the dataset. */
    description: string;
    /** The research question of the dataset. */
    researchQuestion: string;
    /** The coding notes of the dataset. */
    codingNotes: string;
    /** The data chunks in the dataset. */
    data: Record<string, Record<string, T>>;
    /** Get the speaker name from the user ID. */
    getSpeakerName?: (userID: string) => string;
    /** Get the speaker name (in example only) from the user ID. */
    getSpeakerNameForExample?: (userID: string) => string;
}

/** An unloaded JSON representation of a dataset. */
export interface RawDataset extends Dataset<RawDataChunk> {
    data: Record<string, string>;
}

/** A collection of qualitatively coded threads. */
export interface CodedThreads {
    /** The qualitatively coded threads. */
    Threads: Record<string, CodedThread>;
    /** The summarized codebook. */
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
    /** Title: The title of the comparison. */
    Title: string;
    /** Source: The underlying dataset of the codebooks. */
    Source: Dataset<T>;
    /** Codebooks: The codebooks to compare with. */
    Codebooks: Codebook[];
    /** Names: The names of the codebooks. */
    Names: string[];
    /** Codes: The codes in the combined codebook. */
    Codes: Code[];
    /** Weights: The weights of the codes in the combined codebook. */
    Weights?: number[];
    /** TotalWeight: The total weight of the codebooks. */
    TotalWeight?: number;
    /** UserIDToNicknames: The mapping from user ID to nicknames. */
    UserIDToNicknames?: Map<string, string>;
    /** Distances: The distance matrix between codes in the first codebook. */
    Distances: number[][];
}

/** Codebook: A codebook for the qualitative codes. */
export type Codebook = Record<string, Code>;

/** CodebookEvaluation: Evaluation of a codebook. */
export type CodebookEvaluation = Record<string, number>;

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
    tags: string[];
    /** Visits: Number of total visits (until now, not the cutoff date). */
    Visits: number;
    /** Stars: Number of total stars (until now, not the cutoff date). */
    Stars: number;
    /** Supports: Number of total supports (until now, not the cutoff date). */
    Supports: number;
    /** Remixes: Number of total remixes (until now, not the cutoff date). */
    Remixes: number;
    /** Cover: The cover image of the project. */
    Cover: string;
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

export type BertopicTopics = Record<
    number,
    {
        IDs: number[];
        Probabilities: number[];
        Keywords: string[];
    }
>;
