/** An item in a dataset (e.g. a message). */
export interface DataItem {
    /** The ID of the item. */
    id: string;
    /** The sender ID of the item. */
    uid: string;
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
    /** The beginning time of the chunk. */
    start: Date;
    /** The ending time of the chunk. */
    end: Date;
    /** Data items in the chunk. */
    items: (T | DataChunk<T>)[];
    /** The participants that this chunk mentioned. */
    mentions?: string[];
}

/** An unloaded JSON representation of a data chunk. */
export interface RawDataChunk extends DataChunk<RawDataItem> {
    start: string;
    end: string;
    items: (RawDataItem | RawDataChunk)[];
}

/** A dataset for qualitative analysis. */
export interface Dataset<T extends DataChunk> {
    /** The path to the dataset. */
    path: string;
    /** The name of the dataset (path-friendly). */
    name: string;
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
    getSpeakerName: (uid: string) => string;
    /** Get the speaker name (in example only) from the user ID. */
    getSpeakerNameForExample: (uid: string) => string;
}

/** An unloaded JSON representation of a dataset. */
export interface RawDataset extends Omit<Dataset<RawDataChunk>, "path"> {
    data: Record<string, string>;
    getSpeakerName?: (uid: string) => string;
    getSpeakerNameForExample?: (uid: string) => string;
}

/** A qualitative code. */
export interface Code {
    /** The label of the code. */
    label: string;
    /** Categories of the code. */
    categories?: string[];
    /** Definitions of the code. */
    definitions?: string[];
    /** Examples of the code. */
    examples?: string[];
    /** Alternative labels of the code. */
    alternatives?: string[];
    /** Temporary, old labels of the code. Only used in consolidation. */
    oldLabels?: string[];
    /** Owner codebooks of the code. Only used in evaluation. */
    owners?: number[];
    /** Visual position of the code. Only used in evaluation. */
    position?: [number, number];
}

/** Codebook: A codebook for the qualitative codes. */
export type Codebook = Record<string, Code>;

/**
 * A qualitatively coded item (e.g. a comment, a message).
 * Depending on the context, each prompt/ways of coding may use some or all of the following fields.
 */
export interface CodedItem {
    /** The ID of the item. */
    id: string;
    /** Qualitative codes on the item. */
    codes?: string[];
}

/**
 * A qualitatively coded thread (e.g. a project, a conversation).
 * Depending on the context, each prompt/ways of coding may use some or all of the following fields.
 */
export interface CodedThread {
    /** The ID of the item. */
    id: string;
    /** Summary of the thread. */
    summary?: string;
    /** Plans before the coding. */
    plan?: string;
    /** Reflections after the coding. */
    reflection?: string;
    /** The codes used in the coding. */
    codes: Codebook;
    /** Coded items in the thread. */
    items: Record<string, CodedItem>;
    /** The iteration of the coding. */
    iteration: number;
}

/** A collection of qualitatively coded threads. */
export interface CodedThreads {
    /** The qualitatively coded threads. */
    threads: Record<string, CodedThread>;
    /** The summarized codebook. */
    codebook?: Codebook;
}

/** A collection of qualitatively coded threads, with a codebook. */
export interface CodedThreadsWithCodebook extends CodedThreads {
    /** The summarized codebook. */
    codebook: Codebook;
}

/** A message in a group chat. */
export interface Message extends DataItem {
    /** firstSeen: Whether the sender is first seen in the group. */
    firstSeen?: boolean;
}

/** A segment of the group chat. */
export interface Conversation extends DataChunk<Message> {
    /** The time the conversation started. */
    start: Date;
    /** The time the conversation ended. */
    end: Date;
    /** The participants in the conversation. */
    participants: Map<string, number>;
    /** The number of first-time participants. */
    firstSeen: number;
}

/** A package for comparing codebooks. */
export interface CodebookComparison<T extends DataChunk<DataItem>> {
    /** The title of the comparison. */
    title: string;
    /** The underlying dataset of the codebooks. */
    source: Dataset<T>;
    /** The codebooks to compare with. */
    codebooks: Codebook[];
    /** The names of the codebooks. */
    names: string[];
    /** The codes in the combined codebook. */
    codes: Code[];
    /** The weights of the codes in the combined codebook. */
    weights?: number[];
    /** The total weight of the codebooks. */
    totalWeight?: number;
    /** The mapping from user ID to nicknames. */
    uidToNicknames?: Map<string, string>;
    /** The distance matrix between codes in the first codebook. */
    distances: number[][];
}

/** CodebookEvaluation: Evaluation of a codebook. */
export type CodebookEvaluation = Record<string, number>;

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
