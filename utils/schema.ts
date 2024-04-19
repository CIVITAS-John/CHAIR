// Schema for the dataset.
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
    Codes: Record<string, Code>;
    /** Items: Coded items in the thread. */
    Items: Record<string, CodedItem>;
    /** Iteration: The iteration of the coding. */
    Iteration: number;
}

/** CodedItem: A qualitatively coded item (e.g. a comment, a message). */
// Depending on the context, each prompt/ways of coding may use some or all of the following fields.
export interface CodedItem {
    /** ID: The ID of the item. */
    ID: string;
    /** Codes: Qualitative codes on the item. */
    Codes?: string[];
}

/** Code: A qualitative code. */
export interface Code {
    /** Category: The category of the code. */
    Category: string;
    /** Label: The label of the code. */
    Label: string;
    /** Description: The description of the code. */
    Description?: string;
    /** Examples: Examples of the code. */
    Examples?: string[];
    /** Alternatives: Alternative labels. */
    Alternatives?: string[];
}

/** Conversation: A segment of the group chat. */
export interface Conversation {
    /** ID: The ID of the conversation. */
    ID: string;
    /** Start: The time the conversation started. */
    Start: Date;
    /** End: The time the conversation ended. */
    End: Date;
    /** Participants: The participants in the conversation. */
    Participants: Map<string, number>;
    /** Mentions: The participants that this conversation mentioned. */
    Mentions: string[];
    /** Messages: The number of messages in the conversation. */
    Messages: number;
    /** FirstSeen: The number of first-time participants. */
    FirstSeen: number;
    /** AllMessages: All messages in the conversation. */
    AllMessages?: Message[];
}

/** Message: A message in a group chat. */
export interface Message {
    /** ID: The ID of the message. */
    ID: string;
    /** SenderID: The ID of sender of the message. */
    SenderID: string;
    /** Nickname: The nickname of the sender. */
    Nickname: string;
    /** Time: The time the message was sent. */
    Time: Date;
    /** Content: The content of the message. */
    Content: string;
    /** FirstSeen: Whether the sender is first seen in the group. */
    FirstSeen?: boolean;
    /** Mentions: The participants that this message mentioned */
    Mentions?: string[];
    /** Conversation: The conversationID of the message. */
    Conversation?: string;
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
export interface Project {
    /** ID: The ID of the project. */
    ID: string;
    /** Category: The category of the project. */
    Category: string;
    /** UserID: The ID of the user who created the project. */
    UserID: string;
    /** Nickname: The nickname of the user who created the project. */
    Nickname: string;
    /** CurrentNickname: The current nickname at the time of sharing. */
    CurrentNickname?: string;
    /** Time: The time the message was sent. */
    Time: Date;
    /** Title: Title of the project. */
    Title: string;
    /** Tags: Tags of the project. */
    Tags: string[];
    /** Content: The content of the project. */
    Content: string;
    /** Visits: Number of total visits (until now, not the cutoff date). */
    Visits: number;
    /** Stars: Number of total stars (until now, not the cutoff date). */
    Stars: number;
    /** Supports: Number of total supports (until now, not the cutoff date). */
    Supports: number;
    /** Remixes: Number of total remixes (until now, not the cutoff date). */
    Remixes: number;
    /** Mentioned: The users mentioned by this project. */
    Mentioned?: string[];
    /** Cover: The cover image of the project. */
    Cover: string,
    /** Comments: Comments on the project. */
    Comments?: Comment[];
}

/** Comment: A comment on a project or a user. */
export interface Comment {
    /** ID: The ID of the project. */
    ID: string;
    /** UserID: The ID of the user who created the project. */
    UserID: string;
    /** Nickname: The nickname of the user who posted the comment. */
    Nickname: string;
    /** CurrentNickname: The current nickname at the time of posting. */
    CurrentNickname?: string;
    /** Time: The time the message was sent. */
    Time: Date;
    /** Content: The content of the project. */
    Content: string;
    /** Mentioned: The users mentioned by this project. */
    Mentioned?: string[];
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