import * as File from 'fs';
import { LLMName, MaxOutput } from "../utils/llms.js";
import { GetMessagesPath, GetParticipantsPath, LoadMessages, LoadParticipants } from "../utils/loader.js";
import { Message, Participant } from '../utils/schema.js';
import { TranslateStrings } from "./general.js";
import { ExportMessages } from '../utils/export.js';
import Excel from 'exceljs';
const { Workbook } = Excel;

/** TranslateConversation: Translate certain conversations for qualitative coding. */
export async function TranslateConversations(Group: string, Conversations: number[]): Promise<void> {
    var AllMessages = LoadMessages(Group).filter(Message => Message.SenderID != "0");
    // Before we start, we need to translate all participants
    var Participants = LoadParticipants();
    console.log(`Participants to translate: ${Participants.length}`);
    Participants = await TranslateParticipants(Participants);
    // Write into JSON file
    File.writeFileSync(GetParticipantsPath("Participants-Translated.json"), JSON.stringify(Participants, null, 4));
    // Create the Excel workbook
    var Book = new Workbook();
    for (const Conversation of Conversations) {
        var Messages = await TranslateConversation(Group, AllMessages, Participants, Conversation);
        if (Messages.length == 0) continue;
        // Write into Excel worksheet
        var Sheet = Book.addWorksheet(`${Conversation}`, {
            views:[ { state: 'frozen', xSplit: 1, ySplit: 1 } ]
        });
        Sheet.columns = [
            { header: 'ID', key: 'ID', width: 6 },
            { header: 'CID', key: 'CID', width: 6 },
            { header: 'SID', key: 'SID', width: 6 },
            { header: 'Nickname', key: 'Nickname', width: 16 },
            { header: 'Time', key: 'Time', width: 13, style: { numFmt: 'mm/dd hh:MM' } },
            { header: 'In', key: 'In', width: 3 },
            { header: 'Content', key: 'Content', width: 120 },
            { header: 'Codes', key: 'Codes', width: 80 }
        ];
        Sheet.getRow(1).alignment = { vertical: 'middle', wrapText: true };
        Sheet.getRow(1).font = {
            name: 'Lato',
            family: 4,
            size: 12,
            bold: true
        };
        Sheet.properties.defaultRowHeight = 18;
        // Write the messages
        for (let I = 0; I < Messages.length; I++) {
            var Message = Messages[I];
            var Row = Sheet.addRow({
                ID: parseInt(Message.ID),
                CID: parseInt(Message.Conversation!),
                SID: parseInt(Message.SenderID),
                Nickname: Message.Nickname,
                Time: Message.Time,
                In: Message.Conversation == Conversation.toString() ? "Y" : "N",
                Content: Message.Content,
                Codes: ""
            })
            Row.font = {
                name: 'Lato',
                family: 4,
                size: 12,
                color: { argb:  Message.Conversation == Conversation.toString() ? 'FF000000' : 'FF666666' }
            };
            Row.alignment = { vertical: 'middle' };
            Row.getCell("Content").alignment = { vertical: 'middle', wrapText: true };
        }
        Sheet.addRow({});
        // Last row for notes
        var LastRow = Sheet.addRow({ ID: -1, Content: "Leave your note in this cell." });
        LastRow.alignment = { vertical: 'middle' };
        LastRow.getCell("Content").alignment = { vertical: 'middle', wrapText: true };
        LastRow.font = {
            name: 'Lato',
            family: 4,
            size: 12
        };
    }
    // Save the Excel file
    await Book.xlsx.writeFile(GetMessagesPath(Group, `Conversations/${Conversations[0]}~${Conversations[Conversations.length - 1]}-${LLMName}.xlsx`));
}

/** TranslateConversation: Translate certain messages from a conversation. */
async function TranslateConversation(Group: string, AllMessages: Message[], Participants: Participant[], Conversation: number, Bilingual: boolean = false): Promise<Message[]> {
    // Get the messages we want: 3 messages before and after the conversation
    var FirstIndex = AllMessages.findIndex(Message => Message.Conversation == Conversation.toString());
    var LastIndex = AllMessages.findLastIndex(Message => Message.Conversation == Conversation.toString());
    if (FirstIndex == -1 || LastIndex == -1) return [];
    var Messages = AllMessages.slice(Math.max(0, FirstIndex - 3), Math.min(AllMessages.length, LastIndex + 4));
    // Keep the original messages for bilingual translation
    var Originals = JSON.parse(JSON.stringify(Messages)) as Message[]; 
    console.log(`Messages to translate: ${Messages.length}`);
    // Translate the messages with LLM
    Messages = await TranslateMessages(Messages, Participants);
    // Write into JSON file
    File.writeFileSync(GetMessagesPath(Group, `Conversations/${Conversation}-${LLMName}.json`), JSON.stringify(Messages, null, 4));
    // Write into Markdown file
    File.writeFileSync(GetMessagesPath(Group, `Conversations/${Conversation}-${LLMName}.md`), ExportMessages(Messages, Bilingual ? Originals : undefined));
    return Messages;
}

// TranslateParticipants: Translate a bunch of participants.
export async function TranslateParticipants(Participants: Participant[]): Promise<Participant[]> {
    var Nicknames = Participants.map((Participant) => Participant.Nickname);
    var TranslatedNicknames = await TranslateStrings("nickname", Nicknames);
    for (let I = 0; I < Participants.length; I++) {
        Participants[I].Nickname = TranslatedNicknames[I];
    }
    return Participants;
}

// TranslateMessages: Translate a bunch of messages.
export async function TranslateMessages(Messages: Message[], Participants: Participant[]): Promise<Message[]> {
    // Build a map for the participants
    var ParticipantMap = new Map<string, Participant>();
    Participants.forEach((Participant) => ParticipantMap.set(Participant.ID, Participant));
    // Get the nicknames and contents
    var Nicknames = Messages.map((Message) => Message.Nickname);
    var Contents = Messages.map((Message) => {
        // Handle the mentioned users (=> @ID)
        Message.Content = Message.Content.replaceAll(/@(.*?)\((\d+)\)(\s|$)/g, (Match, Name, ID) => {
            return `@${ID} `;
        });
        // Truncate the message if it's too long
        // Here we leave some rooms since the model might need more tokens than the source text to translate
        if (Message.Content.length >= MaxOutput * 0.75) 
            Message.Content = Message.Content.substring(0, MaxOutput * 0.75) + " (Too long to translate)";
        return Message.Content;
    });
    // Translate the nicknames and contents
    var TranslatedNicknames = await TranslateStrings("nickname", Nicknames);
    var TranslatedContents = await TranslateStrings("messages", Contents);
    // Assign the translated nicknames and contents
    for (let I = 0; I < Messages.length; I++) {
        Messages[I].Nickname = TranslatedNicknames[I];
        // Handle the mentioned users (=> @Nickname (ID))
        var Content = TranslatedContents[I];
        Content = Content.replaceAll(/@(\d+)(\s|$|,)/g, (Match, ID) => {
            if (ParticipantMap.has(ID)) {
                var Participant = ParticipantMap.get(ID)!;
                return `@${Participant.Nickname} (${ID}) `;
            } else return `@${ID} `;
        });
        Messages[I].Content = Content;
    }
    return Messages;
}