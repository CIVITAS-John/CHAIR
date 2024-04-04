import * as File from 'fs';
import { CutoffDate, DatasetPath } from '../constants';

/** Message: A message in a group chat. */
interface Message {
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
}

/** Participant: A participant in a group chat. */
interface Participant {
    /** ID: The ID of the participant. */
    ID: string;
    /** Nickname: The initial nickname of the participant. */
    Nickname: string;
    /** Messages: The number of messages sent by the participant. */
    Messages: number;
    /** FirstSeen: The time the participant first appeared in the group. */
    FirstSeen: Date;
}

/** ReadQQMessages: Read messages from a text record of QQ groups. */
function ReadQQMessages(Path: string): Message[] {
    const Messages: Message[] = [];
    const Sources = File.readFileSync(Path, 'utf-8').split('\r\n');
    var LastMessage: Message | undefined;
    for (const Source of Sources) {
        var Match = Source.match(/(\d{4})-(\d{2})-(\d{2}) ([0-1]?\d):(\d{2}):(\d{2}) (AM|PM) (.*?)(\(\d+\)|<.*?>)/);
        if (Match !== null) {
            const Time = new Date(Number(Match[1]), Number(Match[2]) - 1, Number(Match[3]), 
                Number(Match[4]) + (Match[7] === 'PM' ? 12 : 0), Number(Match[5]), Number(Match[6]));
            LastMessage = { 
                SenderID: Match[9].substring(1, Match[9].length - 1), 
                Nickname: Match[8].replaceAll(/"|,/g, ''),
                Time, 
                Content: '' };
            if (LastMessage.Time > CutoffDate) break;
            Messages.push(LastMessage);
        }  else if (LastMessage !== undefined) {
            LastMessage.Content += Source;
        }
    }
    return Messages;
}

// Read messages from the groups, anonymize user ids, and export into JSON and CSV format.
const RootPath = `${DatasetPath}\\Messaging Groups`;
const Groups = [String.raw`Users of Physics Lab (Group 1)`, String.raw`Users of Physics Lab (Group 2)`];
const Participants = new Map<string, Participant>();
// Many users have multiple nicknames, so we need to map the `@...` references to a single ID.
const NameMappings = new Map<string, [string, string]>();
var Index = 0;
for (const Group of Groups) {
    const Messages = ReadQQMessages(`${RootPath}\\${Group}\\Raw.txt`);
    // First pass: get the participants and anonymize the user ids.
    for (const Message of Messages) {
        if (!Participants.has(Message.SenderID)) {
            Participants.set(Message.SenderID, { 
                ID: Participants.size.toString(), 
                Nickname: Message.Nickname, 
                Messages: 0,
                FirstSeen: Message.Time
            });
            Message.FirstSeen = true;
        } else {
            Message.FirstSeen = false;
            var Participant = Participants.get(Message.SenderID)!;
            Participant.Messages++;
            if (Participant.Nickname == "") Participant.Nickname = Message.Nickname;
        }
    }
    // Second pass: go through the messages
    for (const Message of Messages) {
        // Count the participant
        var Participant = Participants.get(Message.SenderID)!;
        NameMappings.set(Message.Nickname, [Participant.ID, Participant.Nickname]);
        // Adapt the message
        Message.SenderID = Participant.ID;
        Message.Nickname = Participant.Nickname;
        // Here, we need to replace all `@...` references with the corresponding ID.
        Message.Content = Message.Content.replaceAll(/\@(.*?)\s/g, (Match, Name) => {
            if (NameMappings.has(Name)) {
                var Metadata = NameMappings.get(Name)!;
                Message.Mentions = Message.Mentions ?? [];
                Message.Mentions.push(Metadata[0]);
                return `@${Metadata[1]}(${Metadata[0]})`;
            } else return Match;
        });
    }
    // Write the messages into a JSON file.
    File.writeFileSync(`${RootPath}\\${Group}\\Messages.json`, JSON.stringify(Messages, null, 4));
    // Write the messages (metadata) into a CSV file using Unix timestamp. Only length of content is stored.
    File.writeFileSync(`${RootPath}\\${Group}\\Messages.csv`, 'Source,ID,Nickname,Time,Timestamp,First,Length,Mentions\n' + 
        Messages.filter(Message => Message.SenderID != "0").map(Message => `${Index},${Message.SenderID},${Message.Nickname},${Message.Time.toISOString()},${Message.Time.getTime()},${Message.FirstSeen},${Message.Content.length},${Message.Mentions?.length ?? 0}`).join('\n'));
    NameMappings.clear();
    Index++;
    console.log(`Exported ${Messages.length} messages.`)
}

// For Stata: need to + 315619200000

// Write all participants into a JSON file.
File.writeFileSync(`${RootPath}\\Participants.json`, JSON.stringify(Array.from(Participants.values()), null, 4));

// Write all participants into a CSV file.
File.writeFileSync(`${RootPath}\\Participants.csv`, 'ID,Nickname,Messages,FirstSeen,FirstTimestamp\n' + 
    Array.from(Participants.values()).map(Participant => `${Participant.ID},${Participant.Nickname},${Participant.Messages},${Participant.FirstSeen.toISOString()},${Participant.FirstSeen.getTime()}`).join('\n'));

console.log(`Exported ${Participants.size} participants.`)