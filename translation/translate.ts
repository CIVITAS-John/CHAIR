import { MaxOutput } from "../utils/llms";
import { Message, Participant } from '../utils/schema';
import { TranslateStrings } from "./general";

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
        if (Message.Content.length >= MaxOutput) 
            Message.Content = Message.Content.substring(0, MaxOutput - 20) + " (Too long to translate)";
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
        Content = Content.replaceAll(/@(\d+)(\s|$)/g, (Match, ID) => {
            if (ParticipantMap.has(ID)) {
                var Participant = ParticipantMap.get(ID)!;
                return `@${Participant.Nickname} (${ID}) `;
            } else return `@${ID} `;
        });
        Messages[I].Content = Content;
    }
    return Messages;
}