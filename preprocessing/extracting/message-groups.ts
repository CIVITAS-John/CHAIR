import * as File from "fs";
import { Tokenize } from "../../utils/tokenizer.js";
import { Message, Participant } from "../../utils/schema.js";
import { GetMessagesPath, GetParticipantsPath } from "../../utils/loader.js";

// CutoffDate: The cutoff date for the dataset.
export const CutoffDate = new Date(2021, 0, 1);

/** ReadQQMessages: Read messages from a text record of QQ groups. */
function ReadQQMessages(Path: string, Prefix: string): Message[] {
    const Messages: Message[] = [];
    const Sources = File.readFileSync(Path, "utf-8").split("\r\n");
    let LastMessage: Message | undefined;
    for (const Source of Sources) {
        const Match = /(\d{4})-(\d{2})-(\d{2}) ([0-1]?\d):(\d{2}):(\d{2}) (AM|PM) (.*?)(\(\d+\)|<.*?>)/.exec(Source);
        if (Match !== null) {
            const Time = new Date(
                Number(Match[1]),
                Number(Match[2]) - 1,
                Number(Match[3]),
                Number(Match[4]) + (Match[7] === "PM" ? 12 : 0),
                Number(Match[5]),
                Number(Match[6]),
            );
            LastMessage = {
                ID: `${Prefix}-${Messages.length.toString()}`,
                UserID: Match[9].substring(1, Match[9].length - 1),
                Nickname: Match[8].replaceAll(/"|,/g, "").replaceAll(/^【.{2}】/g, ""),
                Time,
                Content: "",
            };
            if (LastMessage.Time > CutoffDate) {
                break;
            }
            Messages.push(LastMessage);
        } else if (LastMessage !== undefined) {
            LastMessage.Content += `${Source.replace("\r", "\n").trim()}\n`;
        }
    }
    return Messages;
}

// Read emojis
const Emojis = File.readFileSync("./known/emoji.csv", "utf-8").split("\n");
const EmojiMap = new Map<string | RegExp, string>();
for (const Emoji of Emojis) {
    const LastSeperator = Emoji.lastIndexOf(",");
    const [_Source, Translation] = [Emoji.substring(0, LastSeperator), Emoji.substring(LastSeperator + 1)];
    let Source = _Source;
    if (Source.includes("{")) {
        EmojiMap.set(new RegExp(Source, "g"), Translation.trim());
    } else {
        if (!Source.startsWith("[")) {
            Source = `/${Source}`;
        }
        EmojiMap.set(Source, Translation.trim());
    }
}
const UnknownEmojis = new Map<string, number>();

// Read messages from the groups, anonymize user ids, and export into JSON and CSV format.
const Groups = [String.raw`Users of Physics Lab (Group 1)`, String.raw`Users of Physics Lab (Group 2)`];
const Participants = new Map<string, Participant>();
// Many users have multiple nicknames, so we need to map the `@...` references to a single ID.
const NameMappings = new Map<string, [string, string]>();
let Index = 0;
for (const Group of Groups) {
    const Messages = ReadQQMessages(GetMessagesPath(Group, "Raw.txt"), (Index + 1).toString());
    // First pass: get the participants and anonymize the user ids.
    for (const Message of Messages) {
        if (!Participants.has(Message.UserID)) {
            Participants.set(Message.UserID, {
                ID: Participants.size.toString(),
                Nickname: Message.Nickname,
                Messages: 0,
                FirstSeen: Message.Time,
            });
            Message.FirstSeen = true;
        } else {
            Message.FirstSeen = false;
            const Participant = Participants.get(Message.UserID) ?? ({} as Participant);
            Participant.Messages++;
            if (Participant.Nickname === "") {
                Participant.Nickname = Message.Nickname;
            }
        }
    }
    // Second pass: go through the messages
    for (const Message of Messages) {
        // Count the participant
        const Participant = Participants.get(Message.UserID) ?? ({} as Participant);
        NameMappings.set(Message.Nickname, [Participant.ID, Participant.Nickname]);
        // Adapt the message
        Message.UserID = Participant.ID;
        Message.Nickname = Participant.Nickname;
        // Here, we need to replace all `@...` references with the corresponding ID.
        Message.Content = Message.Content.replaceAll(/@(.*?)(\s|$)/g, (Match, Name: string) => {
            if (NameMappings.has(Name)) {
                const Metadata = NameMappings.get(Name) ?? ["", ""];
                Message.Mentions = Message.Mentions ?? [];
                Message.Mentions.push(Metadata[0]);
                return `@${Metadata[1]}(${Metadata[0]}) `;
            }
            return Match;
        });
        // Here, we need to replace all emojis with the corresponding translation.
        for (const [Source, Translation] of EmojiMap) {
            Message.Content = Message.Content.replaceAll(Source, Translation);
        }
        Message.Content = Message.Content.trim();
        // Identify unknown emojis
        for (const UnknownEmoji of Message.Content.matchAll(/\/([\u4e00-\u9fa5]{1,4})/g)) {
            UnknownEmojis.set(UnknownEmoji[1], (UnknownEmojis.get(UnknownEmoji[1]) ?? 0) + 1);
        }
    }
    // Sort messages by time (sometimes, my computer may receive records in incorrect orders)
    Messages.sort((A, B) => A.Time.getTime() - B.Time.getTime());
    // Write the unknown emojis into a CSV file.
    File.writeFileSync(
        "./known/unknown-emoji.csv",
        `Emoji,Frequency\n${Array.from(UnknownEmojis)
            .filter((Emoji) => Emoji[1] > 2)
            .map((Emoji) => `${Emoji[0]},${Emoji[1]}`)
            .join(",\n")}`,
    );
    // Write the messages into a JSON file.
    File.writeFileSync(GetMessagesPath(Group, "Messages.json"), JSON.stringify(Messages, null, 4));
    // Write the messages (metadata) into a CSV file using Unix timestamp. Only length of content is stored.
    File.writeFileSync(
        GetMessagesPath(Group, "Messages.csv"),
        `Source,ID,Time,Timestamp,First,Length,Mentions\n${Messages.filter((Message) => Message.UserID !== "0")
            .map(
                (Message, Index) =>
                    `${Index},${Message.UserID},${Message.Time.toISOString()},${Message.Time.getTime()},${Message.FirstSeen},${
                        Message.Content.length
                    },${Message.Mentions?.length ?? 0}`,
            )
            .join("\n")}`,
    );
    NameMappings.clear();
    Index++;
    // Calculate tokens
    const Content = Messages.map((Message) => Message.Content).join("\n");
    console.log(`Exported ${Messages.length} messages, at ${Content.length} chars.`);
}

// For Stata: need to + 315619200000
const ParticipantArray = Array.from(Participants.values());
// Write all participants into a JSON file.
File.writeFileSync(GetParticipantsPath("Participants.json"), JSON.stringify(ParticipantArray, null, 4));

// Write all participants into a CSV file.
File.writeFileSync(
    GetParticipantsPath("Participants.csv"),
    `ID,Messages,FirstSeen,FirstTimestamp\n${ParticipantArray.map(
        (Participant) => `${Participant.ID},${Participant.Messages},${Participant.FirstSeen.toISOString()},${Participant.FirstSeen.getTime()}`,
    ).join("\n")}`,
);

// Calculate tokens
const Tokens = Tokenize(ParticipantArray.map((Participant) => Participant.Nickname).join("\n")).length;
console.log(`Exported ${Participants.size} participants, estimated at ${Tokens} tokens.`);
