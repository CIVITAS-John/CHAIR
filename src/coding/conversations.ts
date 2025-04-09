import { Analyzer } from "../analyzer.js";
import type { CodedItem, CodedThread, Conversation, Dataset, Message } from "../schema.js";

/** The definition of an abstract conversation analyzer. */
export abstract class ConversationAnalyzer extends Analyzer<Conversation, Message, CodedThread> {}

/** Build a prompt segment with a message. */
export const buildMessagePrompt = (
    dataset: Dataset<unknown>,
    message: Message,
    coded?: CodedItem,
    tagsName = "tags",
    shortenName = false,
) => {
    if (typeof message.content !== "string") {
        return "";
    }
    let content = message.content.replaceAll(/@.*?\((\d+)\)(?:\W|$)/g, (_, id: string) => {
        return `@${shortenName ? dataset.getSpeakerNameForExample(id) : dataset.getSpeakerName(id)} `;
    });
    // Replace the image and checkin tags to avoid confusing the LLM
    content = content.replace(
        /\[(Image|Checkin|Emoji)\]/g,
        (_Match, Type) => `[${Type} ${message.id}]`,
    );
    // Compose the result
    let result = `${shortenName ? dataset.getSpeakerNameForExample(message.uid) : dataset.getSpeakerName(message.uid)}: ${content}`;
    if (coded?.codes?.length) {
        result += `\nPreliminary ${tagsName}: ${coded.codes.join("; ")}`;
    }
    return result;
};

/** Revert a message format. */
export const revertMessageFormat = (message: string) => {
    return message.replaceAll(/\[(Image|Checkin|Emoji) [^\]]+\]/g, "[$1]");
};
