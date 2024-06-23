import { CodedItem, CodedThread, CodedThreads, Conversation, Message } from '../../utils/schema.js';
import { Analyzer } from '../../analyzer.js';
import { GetSpeakerName } from '../../constants.js';

/** ConversationAnalyzer: The definition of an abstract conversation analyzer. */
export abstract class ConversationAnalyzer extends Analyzer<Conversation, Message, CodedThread> {
}

/** BuildMessagePrompt: Build a prompt segment with a message. */
export function BuildMessagePrompt(Message: Message, Coded?: CodedItem, TagsName: string = "tags"): string {
    var Content = Message.Content.replaceAll(/@(.*?)\((\d+)\)([^\w]|$)/g, (Match, Name, ID) => {
        return `@${GetSpeakerName(ID)} `;
    });
    // Replace the image and checkin tags to avoid confusing the LLM
    Content = Content.replace(/\[(Image|Checkin|Emoji)\]/g, (Match, Type) => `[${Type} ${Message.ID}]`);
    // Compose the result
    var Result = `${GetSpeakerName(Message.UserID)}: ${Content}`;
    if ((Coded?.Codes?.length ?? 0) > 0) Result += `\nPreliminary ${TagsName}: ${Coded!.Codes!.join("; ")}`;
    return Result;
}

/** RevertMessageFormat: Revert a message format. */
export function RevertMessageFormat(Message: string): string {
    return Message.replaceAll(/\[(Image|Checkin|Emoji) [^\]]+\]/g, "[$1]");
}