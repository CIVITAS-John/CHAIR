// Data loader from exported JSON files
import * as File from 'fs';
import { Conversation, Message, Participant, Project } from "./schema.js";
import { DatasetPath } from '../constants.js';

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
    return JSON.parse(File.readFileSync(GetMessagesPath(Group, "Conversations/" + Name), 'utf-8'));
}

/** LoadParticipants: Load the participants. */
export function LoadParticipants(): Participant[] {
    return JSON.parse(File.readFileSync(GetParticipantsPath("Participants.json"), 'utf-8'));
}

/** GetProjectsPath: Get the saving path of certain projects. */
export function GetProjectsPath(Name: string): string { 
    return `${DatasetPath}\\Projects and Comments\\${Name}`; 
}

/** GetMessagesPath: Get the saving path of certain messages. */
export function GetMessagesPath(Group: string, Name: string): string { 
    return `${DatasetPath}\\Messaging Groups\\${Group}\\${Name}`; 
}

/** GetParticipantsPath: Get the saving path of messaging group participants. */
export function GetParticipantsPath(Name: string): string { 
    return `${DatasetPath}\\Messaging Groups\\${Name}`; 
}
