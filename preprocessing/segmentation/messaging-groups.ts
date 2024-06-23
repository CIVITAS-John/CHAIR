import * as File from 'fs';
import { GetMessagesPath, LoadMessages } from "../../utils/loader.js";
import { ExportMessages } from '../../utils/export.js';
import spawnAsync from '@expo/spawn-async';
import { Conversation } from '../../utils/schema.js';

await SeperateMessages("Users of Physics Lab (Group 1)", "1");
await SeperateMessages("Users of Physics Lab (Group 2)", "2");

/** SeperateMessages: Seperate messages into conversations from a group. */
async function SeperateMessages(Source: string, Prefix: string) {
    // Call the Python script
    var Python = spawnAsync('python', ['preprocessing/segmentation/messaging-groups.py', GetMessagesPath(Source, "Messages.csv")]);
    Python.child.stdout!.on('data', (data) => {
        console.log(`${data}`);
    });
    Python.child.stderr!.on('data', (data) => {
        console.error(`${data}`);
    });
    await Python;
    // Load messages
    var Messages = LoadMessages(Source).filter(Message => Message.UserID != "0");
    // Break up messages based on the indexes
    var Indexes = File.readFileSync(GetMessagesPath(Source, `Messages.Groups.csv`), 'utf-8').split('\n').map(Index => Number(Index));
    Indexes[Indexes.length - 1] = Messages.length - 1;
    var Conversations: Conversation[] = [];
    for (var I = 0; I < Indexes.length; I++) {
        var Participants = new Map<string, number>();
        var Mentions = new Set<string>();
        var EndTime: Date;
        var FirstSeen = 0;
        // Count the messages and participants
        for (var J = I == 0 ? 0 : Indexes[I - 1] + 1; J <= Indexes[I]; J++) {
            EndTime = Messages[J].Time;
            Messages[J].Mentions?.forEach(Mention => Mentions.add(Mention));
            if (Messages[J].FirstSeen) FirstSeen++;
            Participants.set(Messages[J].UserID, 1 + (Participants.get(Messages[J].UserID) ?? 0));
        }
        // Create a new conversation
        Conversations.push({ 
            ID: `${Prefix}-${Conversations.length.toString()}`, 
            Start: Messages[Indexes[I]].Time, 
            End: EndTime!,
            Items: Indexes[I] - (I == 0 ? 0 : Indexes[I - 1] + 1) + 1,
            Mentions: [...Mentions],
            Participants: Participants,
            FirstSeen: FirstSeen
        });
    }
    // Now, try to connect orphan conversations
    // Criteria: messages <= 6 (50% pct)
    var Orphans = 0, Merged = 0;
    for (var I = 0; I < Conversations.length; I++) {
        var Current = Conversations[I];
        var Original = Current;
        if (Current.Items > 6) continue;
        Orphans++;
        // If orphan, check if it can be merged with the previous or next conversation
        var MergeBefore = "";
        var MergeAfter = "";
        if (I > 0) {
            var Previous = Conversations[I - 1];
            // Maybe someone mentioned me in the previous conversation, or if all my participants were there
            if (Previous.Mentions!.findIndex(Mention => Original.Participants.has(Mention)) != -1 || 
                [...Original.Participants.keys()].every(Participant => Previous.Participants.has(Participant))) {
                MergeBefore = Previous.ID;
            }
        }
        if (I < Conversations.length - 1) {
            var Next = Conversations[I + 1];
            // Maybe I mentioned someone in the next conversation, or if all my participants were there
            if (Original.Mentions!.findIndex(Mention => Next.Participants.has(Mention)) != -1 ||
                [...Original.Participants.keys()].every(Participant => Next.Participants.has(Participant))) {
                MergeAfter = Next.ID;
            }
        }
        // If both are possible and long enough, merge with the one that is closer
        if (MergeBefore != "" && MergeAfter != "" && (Conversations[I - 1].Items > 6 || Conversations[I + 1].Items > 6)) {
            var DiffBefore = Current.Start.getTime() - Conversations[I - 1].End.getTime();
            var DiffAfter = Conversations[I + 1].Start.getTime() - Current.End.getTime();
            if (DiffAfter > DiffBefore) MergeAfter = "";
            if (DiffBefore > DiffBefore) MergeBefore = "";
        }
        if (MergeBefore != "") {
            var Previous = Conversations[I - 1];
            Previous.End = Current.End;
            Previous.Items += Current.Items;
            Previous.Mentions = [...new Set([...Previous.Mentions!, ...Current.Mentions!])];
            Previous.FirstSeen += Current.FirstSeen;
            for (var [Participant, Count] of Current.Participants)
                Previous.Participants.set(Participant, (Previous.Participants.get(Participant) ?? 0) + Count);
            Current = Previous;
            Conversations.splice(I, 1);
            I--; Merged++;
        }
        if (MergeAfter != "") {
            var Next = Conversations[I + 1];
            Next.ID = Current.ID;
            Next.Start = Current.Start;
            Next.Items += Current.Items;
            Next.Mentions = [...new Set([...Next.Mentions!, ...Current.Mentions!])];
            Next.FirstSeen += Current.FirstSeen;
            for (var [Participant, Count] of Current.Participants)
                Next.Participants.set(Participant, (Next.Participants.get(Participant) ?? 0) + Count);
            Conversations.splice(I, 1);
            I--; Merged++;
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
        Message.Chunk = CurrentConversation.ID;
    }
    // Write the conversation info into a CSV file
    var CSV = "ID,Start,End,Messages,Participants\n";
    Conversations.forEach(Conversation => {
        CSV += `${Conversation.ID},${Conversation.Start.toISOString()},${Conversation.End.toISOString()},${Conversation.Items},${Conversation.Participants.size}\n`;
    });
    File.writeFileSync(GetMessagesPath(Source, `Conversations.csv`), CSV);
    // Write the conversation info into a JSON file
    Conversations.forEach(Conversation => Conversation.Participants = Object.fromEntries(Conversation.Participants) as any);
    File.writeFileSync(GetMessagesPath(Source, `Conversations.json`), JSON.stringify(Conversations, null, 4));
    // Write into JSON and Markdown file
    Messages.forEach((Message, Index) => Message.ID = `${Prefix}-${Index}`);
    File.writeFileSync(GetMessagesPath(Source, "Messages.json"), JSON.stringify(Messages, null, 4));
    File.writeFileSync(GetMessagesPath(Source, `Messages.md`), ExportMessages(Messages));
}