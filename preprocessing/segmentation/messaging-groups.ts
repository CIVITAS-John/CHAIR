import * as File from "fs";

import spawnAsync from "@expo/spawn-async";

import { ExportMessages } from "../../utils/export.js";
import { GetMessagesPath, LoadItems } from "../../utils/loader.js";
import type { Conversation, Message } from "../../utils/schema.js";

await SeperateMessages("Users of Physics Lab (Group 1)", "1");
await SeperateMessages("Users of Physics Lab (Group 2)", "2");

/** SeperateMessages: Seperate messages into conversations from a group. */
async function SeperateMessages(Source: string, Prefix: string) {
    // Call the Python script
    const Python = spawnAsync("python", [
        "preprocessing/segmentation/messaging_groups.py",
        GetMessagesPath(Source, "Messages.csv"),
    ]);
    Python.child.stdout!.on("data", (data) => {
        console.log(`${data}`);
    });
    Python.child.stderr!.on("data", (data) => {
        console.error(`${data}`);
    });
    await Python;
    // Load messages
    const Messages = LoadItems<Message>(GetMessagesPath(Source)).filter(
        (Message) => Message.UserID !== "0",
    );
    // Break up messages based on the indexes
    const Indexes = File.readFileSync(GetMessagesPath(Source, "Messages.Groups.csv"), "utf-8")
        .split("\n")
        .map((Index) => Number(Index));
    Indexes[Indexes.length - 1] = Messages.length - 1;
    const Conversations: Conversation[] = [];
    for (let I = 0; I < Indexes.length; I++) {
        const Participants = new Map<string, number>();
        const Mentions = new Set<string>();
        let EndTime: Date;
        let FirstSeen = 0;
        // Count the messages and participants
        for (let J = I === 0 ? 0 : Indexes[I - 1] + 1; J <= Indexes[I]; J++) {
            EndTime = Messages[J].Time;
            Messages[J].Mentions?.forEach((Mention) => Mentions.add(Mention));
            if (Messages[J].FirstSeen) {
                FirstSeen++;
            }
            Participants.set(Messages[J].UserID, 1 + (Participants.get(Messages[J].UserID) ?? 0));
        }
        // Create a new conversation
        Conversations.push({
            ID: `${Prefix}-${Conversations.length.toString()}`,
            Start: Messages[Indexes[I]].Time,
            End: EndTime!,
            Items: Indexes[I] - (I === 0 ? 0 : Indexes[I - 1] + 1) + 1,
            Mentions: [...Mentions],
            Participants,
            FirstSeen,
        });
    }
    // Now, try to connect orphan conversations
    // Criteria: messages <= 6 (50% pct)
    let Orphans = 0,
        Merged = 0;
    for (let I = 0; I < Conversations.length; I++) {
        let Current = Conversations[I];
        const Original = Current;
        if (Current.Items > 6) {
            continue;
        }
        Orphans++;
        // If orphan, check if it can be merged with the previous or next conversation
        let MergeBefore = "";
        let MergeAfter = "";
        if (I > 0) {
            const Previous = Conversations[I - 1];
            // Maybe someone mentioned me in the previous conversation, or if all my participants were there
            if (
                Previous.Mentions!.findIndex((Mention) => Original.Participants.has(Mention)) !==
                    -1 ||
                [...Original.Participants.keys()].every((Participant) =>
                    Previous.Participants.has(Participant),
                )
            ) {
                MergeBefore = Previous.ID;
            }
        }
        if (I < Conversations.length - 1) {
            const Next = Conversations[I + 1];
            // Maybe I mentioned someone in the next conversation, or if all my participants were there
            if (
                Original.Mentions!.findIndex((Mention) => Next.Participants.has(Mention)) !== -1 ||
                [...Original.Participants.keys()].every((Participant) =>
                    Next.Participants.has(Participant),
                )
            ) {
                MergeAfter = Next.ID;
            }
        }
        // If both are possible and long enough, merge with the one that is closer
        if (
            MergeBefore !== "" &&
            MergeAfter !== "" &&
            (Conversations[I - 1].Items > 6 || Conversations[I + 1].Items > 6)
        ) {
            const DiffBefore = Current.Start.getTime() - Conversations[I - 1].End.getTime();
            const DiffAfter = Conversations[I + 1].Start.getTime() - Current.End.getTime();
            if (DiffAfter > DiffBefore) {
                MergeAfter = "";
            }
            if (DiffBefore > DiffBefore) {
                MergeBefore = "";
            }
        }
        if (MergeBefore !== "") {
            const Previous = Conversations[I - 1];
            Previous.End = Current.End;
            Previous.Items += Current.Items;
            Previous.Mentions = [...new Set([...Previous.Mentions!, ...Current.Mentions!])];
            Previous.FirstSeen += Current.FirstSeen;
            for (const [Participant, Count] of Current.Participants) {
                Previous.Participants.set(
                    Participant,
                    (Previous.Participants.get(Participant) ?? 0) + Count,
                );
            }
            Current = Previous;
            Conversations.splice(I, 1);
            I--;
            Merged++;
        }
        if (MergeAfter !== "") {
            const Next = Conversations[I + 1];
            Next.ID = Current.ID;
            Next.Start = Current.Start;
            Next.Items += Current.Items;
            Next.Mentions = [...new Set([...Next.Mentions!, ...Current.Mentions!])];
            Next.FirstSeen += Current.FirstSeen;
            for (const [Participant, Count] of Current.Participants) {
                Next.Participants.set(
                    Participant,
                    (Next.Participants.get(Participant) ?? 0) + Count,
                );
            }
            Conversations.splice(I, 1);
            I--;
            Merged++;
        }
    }
    console.log("Orphan conversations:", Orphans, "Merged conversations:", Merged);
    // Assign conversation IDs to messages
    let ConversationIndex = 0;
    let CurrentConversation = Conversations[ConversationIndex];
    for (const Message of Messages) {
        if (Message.Time > CurrentConversation.End) {
            CurrentConversation = Conversations[++ConversationIndex];
        }
        Message.Chunk = CurrentConversation.ID;
    }
    // Write the conversation info into a CSV file
    let CSV = "ID,Start,End,Messages,Participants\n";
    Conversations.forEach((Conversation) => {
        CSV += `${Conversation.ID},${Conversation.Start.toISOString()},${Conversation.End.toISOString()},${Conversation.Items},${
            Conversation.Participants.size
        }\n`;
    });
    File.writeFileSync(GetMessagesPath(Source, "Conversations.csv"), CSV);
    // Write the conversation info into a JSON file
    File.writeFileSync(
        GetMessagesPath(Source, "Conversations.json"),
        JSON.stringify(
            Conversations.map((Conversation) => ({
                ...Conversation,
                Participants: Object.fromEntries(Conversation.Participants),
            })),
            null,
            4,
        ),
    );
    // Write into JSON and Markdown file
    Messages.forEach((Message, Index) => (Message.ID = `${Prefix}-${Index}`));
    File.writeFileSync(GetMessagesPath(Source, "Messages.json"), JSON.stringify(Messages, null, 4));
    File.writeFileSync(GetMessagesPath(Source, "Messages.md"), ExportMessages(Messages));
}
