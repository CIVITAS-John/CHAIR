import { Analyzer } from "../../analyzer.js";
import { GetSpeakerName, GetSpeakerNameForExample } from "../../constants.js";
import { CodedItem, CodedThread, Conversation, Message } from "../../utils/schema.js";

/** ConversationAnalyzer: The definition of an abstract conversation analyzer. */
export abstract class ConversationAnalyzer extends Analyzer<Conversation, Message, CodedThread> {}

/** BuildMessagePrompt: Build a prompt segment with a message. */
export function BuildMessagePrompt(Message: Message, Coded?: CodedItem, TagsName = "tags", ShortenName = false): string {
    // if (Message.Content === undefined) {
    //     return "";
    // }
    let Content = Message.Content.replaceAll(/@.*?\((\d+)\)([^\w]|$)/g, (_Match, ID: string) => {
        return `@${ShortenName ? GetSpeakerNameForExample(ID) : GetSpeakerName(ID)} `;
    });
    // Replace the image and checkin tags to avoid confusing the LLM
    Content = Content.replace(/\[(Image|Checkin|Emoji)\]/g, (_Match, Type) => `[${Type} ${Message.ID}]`);
    // Compose the result
    let Result = `${ShortenName ? GetSpeakerNameForExample(Message.UserID) : GetSpeakerName(Message.UserID)}: ${Content}`;
    if ((Coded?.Codes?.length ?? 0) > 0) {
        Result += `\nPreliminary ${TagsName}: ${Coded?.Codes?.join("; ")}`;
    }
    return Result;
}

/** RevertMessageFormat: Revert a message format. */
export function RevertMessageFormat(Message: string): string {
    return Message.replaceAll(/\[(Image|Checkin|Emoji) [^\]]+\]/g, "[$1]");
}
