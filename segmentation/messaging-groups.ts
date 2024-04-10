import * as File from 'fs';
import { GetMessagesPath, LoadMessages } from "../utils/loader.js";
import { ExportMessages } from '../utils/export.js';
import spawnAsync from '@expo/spawn-async';
import { Conversation } from '../utils/schema.js';

await SeperateMessages("Users of Physics Lab (Group 1)");

/** SeperateMessages: Seperate messages into conversations from a group. */
async function SeperateMessages(Source: string) {
    // Call the Python script
    var Python = spawnAsync('python', ['segmentation/messaging-groups.py', GetMessagesPath(Source, "Messages.csv")]);
    Python.child.stdout!.on('data', (data) => {
        console.log(`${data}`);
    });
    Python.child.stderr!.on('data', (data) => {
        console.error(`${data}`);
    });
    // Load messages
    var Messages = LoadMessages(Source).filter(Message => Message.SenderID != "0");
    // Break up messages based on the indexes
    var Indexes = File.readFileSync(GetMessagesPath(Source, `Messages.Groups.csv`), 'utf-8').split('\n').map(Index => Number(Index));
    Indexes[Indexes.length - 1] = Messages.length - 1;
    var Conversations: Conversation[] = [];
    for (var I = 0; I < Indexes.length; I++) {
        var Participants = new Map<string, number>();
        var Mentions = new Set<string>();
        var EndTime: Date;
        // Count the messages and participants
        for (var J = I == 0 ? 0 : Indexes[I - 1] + 1; J <= Indexes[I]; J++) {
            EndTime = Messages[J].Time;
            Messages[J].Mentions?.forEach(Mention => Mentions.add(Mention));
            Participants.set(Messages[J].SenderID, 1 + (Participants.get(Messages[J].SenderID) ?? 0));
        }
        // Create a new conversation
        Conversations.push({ 
            ID: Conversations.length.toString(), 
            Start: Messages[Indexes[I]].Time, 
            End: EndTime!,
            Messages: Indexes[I] - (I == 0 ? 0 : Indexes[I - 1] + 1) + 1,
            Mentions: [...Mentions],
            Participants: Participants
        });
    }
    // Now, try to connect orphan conversations
    // Criteria: messages <= 6 (50% pct)
    var Orphans = 0, Merged = 0;
    for (var I = 0; I < Conversations.length; I++) {
        var Current = Conversations[I];
        var Original = Current;
        if (Current.Messages > 6) continue;
        Orphans++;
        if (I > 0) {
            var Previous = Conversations[I - 1];
            // Maybe someone mentioned me in the previous conversation, or if all my participants were there
            if (Previous.Mentions.findIndex(Mention => Original.Participants.has(Mention)) != -1 || 
                [...Original.Participants.keys()].every(Participant => Previous.Participants.has(Participant))) {
                Previous.End = Current.End;
                Previous.Messages += Current.Messages;
                Previous.Mentions = [...new Set([...Previous.Mentions, ...Current.Mentions])];
                Current = Previous;
                Conversations.splice(I, 1);
                I--; Merged++;
            }
        }
        if (I < Conversations.length - 1) {
            var Next = Conversations[I + 1];
            // Maybe I mentioned someone in the next conversation, or if all my participants were there
            if (Original.Mentions.findIndex(Mention => Next.Participants.has(Mention)) != -1 ||
                [...Original.Participants.keys()].every(Participant => Next.Participants.has(Participant))) {
                Next.Start = Current.Start;
                Next.Messages += Current.Messages;
                Next.Mentions = [...new Set([...Next.Mentions, ...Current.Mentions])];
                Conversations.splice(I, 1);
                I--; Merged++;
            }
        }
    }
    console.log("Orphan conversations:", Orphans, "Merged conversations:", Merged);
    // Assign conversation IDs to messages
    var ConversationIndex = 0;
    var CurrentConversation = Conversations[ConversationIndex];
    for (var I = 0; I < Messages.length; I++) {
        var Message = Messages[I];
        if (Message.Time > CurrentConversation.End)
            CurrentConversation = Conversations[++ConversationIndex];
        Message.Conversation = CurrentConversation.ID;
    }
    // Write the conversation info into a JSON file
    File.writeFileSync(GetMessagesPath(Source, `Conversations.json`), JSON.stringify(Conversations, null, 4));
    // Write the conversation info into a CSV file
    var CSV = "ID,Start,End,Messages,Participants\n";
    Conversations.forEach(Conversation => {
        CSV += `${Conversation.ID},${Conversation.Start.toISOString()},${Conversation.End.toISOString()},${Conversation.Messages},${Conversation.Participants.size}\n`;
    });
    File.writeFileSync(GetMessagesPath(Source, `Conversations.csv`), CSV);
    // Write into Markdown file
    File.writeFileSync(GetMessagesPath(Source, `Messages.md`), ExportMessages(Messages));
}