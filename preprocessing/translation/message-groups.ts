import * as File from "fs";

import { ExportChunksForCoding, ExportMessages } from "../../utils/export.js";
import { EnsureFolder, LLMName, MaxOutput } from "../../utils/llms.js";
import { GetMessagesPath, GetParticipantsPath, LoadConversations, LoadItems, LoadParticipants } from "../../utils/loader.js";
import type { Conversation, Message, Participant } from "../../utils/schema.js";

import { TranslateStrings } from "./general.js";

/** ProcessConversations: Load, translate, and export certain conversations for qualitative coding. */
export async function ProcessConversations(Group: string, Targets: number[], Dataset?: string): Promise<void> {
    const AllItems = LoadItems<Message>(GetMessagesPath(Group)).filter((Message) => Message.UserID !== "0");
    // Before we start, we need to translate all participants
    let Participants = LoadParticipants();
    console.log(`Participants to translate: ${Participants.length}`);
    Participants = await TranslateParticipants(Participants);
    // Also, we need to load the conversations
    const Conversations = LoadConversations(Group);
    // Write into JSON file
    File.writeFileSync(GetParticipantsPath("Participants-Translated.json"), JSON.stringify(Participants, null, 4));
    // Create the Excel workbook
    const IDs = new Set<string>();
    const ResultMessages: Message[] = [];
    const Results: Record<string, Conversation> = {};
    let Minimum = -1,
        Maximum = 0;
    for (const Target of Targets) {
        const Conversation = Conversations.find((Conversation) => Conversation.ID.endsWith(`-${Target}`));
        if (!Conversation) {
            continue;
        }
        const Messages = await TranslateConversation(Group, AllItems, Participants, Conversation.ID);
        if (Messages.length === 0) {
            continue;
        }
        // Get and count conversations
        if (Minimum === -1) {
            Minimum = Target;
        }
        Maximum = Target;
        Results[Conversation.ID] = Conversation;
        Results[Conversation.ID].AllItems = Messages;
        Messages.forEach((Message) => {
            if (IDs.has(Message.ID)) {
                return;
            }
            IDs.add(Message.ID);
            ResultMessages.push(Message);
        });
    }
    // Get the export path
    Dataset = Dataset ?? Group;
    EnsureFolder(GetMessagesPath(Dataset));
    // Save the Excel file
    const Book = ExportChunksForCoding(Object.values(Results));
    await Book.xlsx.writeFile(GetMessagesPath(Dataset, `${Minimum}~${Maximum}-${LLMName}.xlsx`));
    // Write into Markdown file
    File.writeFileSync(GetMessagesPath(Dataset, `${Minimum}~${Maximum}-${LLMName}.md`), ExportMessages(ResultMessages));
    // Write into JSON file
    File.writeFileSync(GetMessagesPath(Dataset, `${Minimum}~${Maximum}-${LLMName}.json`), JSON.stringify(Results, null, 4));
}

/** TranslateConversation: Translate certain messages from a conversation. */
async function TranslateConversation(
    Group: string,
    AllItems: Message[],
    Participants: Participant[],
    Conversation: string,
    Bilingual = false,
): Promise<Message[]> {
    // Get the messages we want: 3 messages before and after the conversation
    const FirstIndex = AllItems.findIndex((Message) => Message.Chunk === Conversation);
    const LastIndex = AllItems.findLastIndex((Message) => Message.Chunk === Conversation);
    if (FirstIndex === -1 || LastIndex === -1) {
        return [];
    }
    let Messages = AllItems.slice(Math.max(0, FirstIndex - 3), Math.min(AllItems.length, LastIndex + 4));
    // Keep the original messages for bilingual translation
    Messages = JSON.parse(JSON.stringify(Messages)) as Message[];
    const Originals = Bilingual ? (JSON.parse(JSON.stringify(Messages)) as Message[]) : undefined;
    console.log(`Messages to translate: ${Messages.length}`);
    // Translate the messages with LLM
    Messages = await TranslateMessages(Messages, Participants);
    // Write into Markdown file
    if (Bilingual) {
        File.writeFileSync(GetMessagesPath(Group, `${Conversation}-${LLMName}.md`), ExportMessages(Messages, Originals));
    }
    return Messages;
}

// TranslateParticipants: Translate a bunch of participants.
export async function TranslateParticipants(Participants: Participant[]): Promise<Participant[]> {
    const Nicknames = Participants.map((Participant) => Participant.Nickname);
    const TranslatedNicknames = await TranslateStrings("nickname", Nicknames);
    for (let I = 0; I < Participants.length; I++) {
        Participants[I].Nickname = TranslatedNicknames[I];
    }
    return Participants;
}

// TranslateMessages: Translate a bunch of messages.
export async function TranslateMessages(Messages: Message[], Participants: Participant[]): Promise<Message[]> {
    // Build a map for the participants
    const ParticipantMap = new Map<string, Participant>();
    Participants.forEach((Participant) => ParticipantMap.set(Participant.ID, Participant));
    // Get the nicknames and contents
    const Nicknames = Messages.map((Message) => Message.Nickname);
    const Contents = Messages.map((Message) => {
        // Handle the mentioned users (=> @ID)
        Message.Content = Message.Content.replaceAll(/@.*?\((\d+)\)(?:\s|$)/g, (_Match, ID) => {
            return `@${ID} `;
        });
        // Truncate the message if it's too long
        // Here we leave some rooms since the model might need more tokens than the source text to translate
        if (Message.Content.length >= MaxOutput * 0.75) {
            Message.Content = `${Message.Content.substring(0, MaxOutput * 0.75)} (Too long to translate)`;
        }
        return Message.Content;
    });
    // Translate the nicknames and contents
    const TranslatedNicknames = await TranslateStrings("nickname", Nicknames);
    const TranslatedContents = await TranslateStrings("messages", Contents);
    // Assign the translated nicknames and contents
    for (let I = 0; I < Messages.length; I++) {
        Messages[I].Nickname = TranslatedNicknames[I];
        // Handle the mentioned users (=> @Nickname (ID))
        let Content = TranslatedContents[I];
        Content = Content.replaceAll(/@(\d+)(\W|$)/g, (_Match, ID: string, Punc) => {
            if (ParticipantMap.has(ID)) {
                const Participant = ParticipantMap.get(ID)!;
                return `@${Participant.Nickname} (${ID})${Punc}`;
            }
            return `@${ID} `;
        });
        Messages[I].Content = Content;
    }
    return Messages;
}
