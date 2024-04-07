// Data loader from exported JSON files
import * as File from 'fs';
import { Message, Participant } from "./schema";
import { DatasetPath } from '../constants';

/** LoadMessages: Load the chat messages. */
export function LoadMessages(Group: string): Message[] {
    const Messages: Message[] = JSON.parse(File.readFileSync(GetMessagesPath(Group, "Messages.json"), 'utf-8'));
    Messages.forEach(Message => {
        Message.Time = new Date(Date.parse(Message.Time as any));
    });
    return Messages;
}

/** LoadParticipants: Load the participants. */
export function LoadParticipants(): Participant[] {
    return JSON.parse(File.readFileSync(GetParticipantsPath("Participants.json"), 'utf-8'));
}

/** GetMessagesPath: Get the saving path of certain messages. */
export function GetMessagesPath(Group: string, Name: string): string { 
    return `${DatasetPath}\\Messaging Groups\\${Group}\\${Name}`; 
}

/** GetParticipantsPath: Get the saving path of messaging group participants. */
export function GetParticipantsPath(Name: string): string { 
    return `${DatasetPath}\\Messaging Groups\\${Name}`; 
}
