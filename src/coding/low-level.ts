import type { CodedThread, Message } from "../schema.js";

import { ConversationAnalyzer } from "./conversations.js";

/**
 * Conduct the first-round low-level coding of the conversations.
 * @author John Chen
 */
export abstract class LowLevelAnalyzerBase extends ConversationAnalyzer {
    /** How we call a tag in the prompt. */
    protected tagName = "tag";
    /** How we call tags in the prompt. */
    protected tagsName = "tags";

    /**
     * Get the chunk size and cursor movement for the LLM.
     * We will fetch at least 10 messages for each batch to keep the context.
     */
    override getChunkSize(
        recommended: number,
        _remaining: number,
        _iteration: number,
        tries: number,
    ): [number, number, number] {
        // For weaker models, we will reduce the chunk size (32 => 24 => 16 => 8)
        if (recommended === this.session.llm.maxItems) {
            return [recommended - tries * 8, 0, 0];
        }
        return [recommended - tries * 2, Math.max(8 - recommended - tries, 0), 0];
    }

    /** ParseResponse: Parse the responses from the LLM. */
    override parseResponse(
        analysis: CodedThread,
        lines: string[],
        messages: Message[],
    ): Promise<Record<number, string>> {
        const results: Record<number, string> = {};
        let nextMessage: ((content: string) => void) | undefined;
        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            const nextLine = i + 1 < lines.length ? lines[i + 1] : "";
            // Remove **bold**
            line = line.replaceAll(/\*\*(.*?)\*\*/g, "$1");
            // Remove ##/###/.. header
            line = line.replace(/^#+ /, "");
            // Recongnize the parts
            if (line.startsWith("Thoughts:")) {
                analysis.plan = line.substring(9).trim();
                if (analysis.plan === "") {
                    nextMessage = (Content) => (analysis.plan = `${analysis.plan}${Content}\n`);
                } else {
                    nextMessage = undefined;
                }
            } else if (line.startsWith("Summary:")) {
                analysis.summary = line.substring(8).trim();
                if (analysis.summary === "") {
                    nextMessage = (Content) =>
                        (analysis.summary = `${analysis.summary}${Content}\n`);
                } else {
                    nextMessage = undefined;
                }
            } else if (line.startsWith("Notes:")) {
                analysis.reflection = line.substring(6).trim();
                if (analysis.reflection === "") {
                    nextMessage = (Content) =>
                        (analysis.reflection = `${analysis.reflection}${Content}\n`);
                } else {
                    nextMessage = undefined;
                }
            } else {
                const match = /^(\d+)\. (.*)$/.exec(line);
                if (match) {
                    const index = parseInt(match[1]) - 1;
                    // Check if index is valid
                    if (index < 0 || index >= messages.length) {
                        continue;
                    }
                    const message = messages[index];
                    let codes = match[2].trim();
                    // Sometimes, the LLM will return the message content and put the codes in the next line
                    if (
                        nextLine !== "" &&
                        !nextLine.startsWith("Summary:") &&
                        !/^\d+\. .*$/.exec(nextLine)
                    ) {
                        codes = nextLine.trim();
                        i++;
                    }
                    // For images, force the tag "Image sharing"
                    if (message.content === "[Image]") {
                        codes = "Image Sharing";
                    }
                    // For emoji, force the tag "Emoji"
                    if (message.content === "[Emoji]") {
                        codes = "Emoji";
                    }
                    // For checkin, force the tag "Checkin"
                    if (message.content === "[Checkin]") {
                        codes = "Checkin";
                    }
                    // Remove the () part
                    codes = codes.replace(/\(.*?\)/, "").trim();
                    // Remove the ** part
                    codes = codes.replace(/\*(.*?)\*/, "$1").trim();
                    // Sometimes the LLM will return "tag{number}: {codes}"
                    codes = codes.replace(new RegExp(`^${this.tagName}(\\d+):`), "").trim();
                    // Sometimes the LLM will return "{codes}, {codes}"
                    codes = codes.replace(/\{(.*?)\}/, "$1").trim();
                    // Sometimes the LLM will start with the original content
                    if (codes.toLowerCase().startsWith(message.content.toLowerCase())) {
                        codes = codes.substring(message.content.length).trim();
                    }
                    // Sometimes the LLM will return "- tags: {codes}"
                    if (codes.startsWith(`- ${this.tagsName}:`)) {
                        codes = codes.substring(7).trim();
                    }
                    // Sometimes the LLM will return "- {codes}"
                    if (codes.startsWith("-")) {
                        codes = codes.substring(1).trim();
                    }
                    // Sometimes the LLM will return "{codes}."
                    if (codes.endsWith(".")) {
                        codes = codes.substring(0, codes.length - 1).trim();
                    }
                    // Sometimes the LLM will return "preliminary tags: {codes}"
                    if (codes.toLowerCase().startsWith(`preliminary ${this.tagsName}:`)) {
                        codes = codes.substring(17).trim();
                    }
                    // Sometimes the LLM will return codes such as AcknowledgingResponse, which should be split into two words
                    codes = codes.replace(/((?<=[a-z][a-z])[A-Z]|[A-Z](?=[a-z]))/g, " $1").trim();
                    // Sometimes the LLM will use -_ to separate words
                    codes = codes.replaceAll("-", " ");
                    codes = codes.replaceAll("_", " ");
                    // Sometimes the LLM will generate multiple spaces
                    codes = codes.replaceAll(/\s+/g, " ");
                    // Sometimes the LLM will return "{speaker}, {other codes}"
                    let speaker = this.dataset.getSpeakerName(message.uid).toLowerCase();
                    if (speaker.includes("-")) {
                        speaker = speaker.substring(0, speaker.indexOf("-")).trim();
                    }
                    codes = codes.replace(new RegExp(`^${speaker} *\\d*(;|:|$)`, "i"), "").trim();
                    // Sometimes the LLM will return "{code}: {explanation}
                    if (/^[\w ]+: /.exec(codes)) {
                        codes = codes.substring(0, codes.indexOf(":")).trim();
                    }
                    results[parseInt(match[1])] = codes;
                    nextMessage = undefined;
                } else if (line !== "" && nextMessage) {
                    nextMessage(line);
                }
            }
        }
        if (Object.values(results).every((Value) => Value === "")) {
            throw new LowLevelAnalyzerBase.InvalidResponseError("All codes are empty");
        }
        if (analysis.plan === undefined) {
            throw new LowLevelAnalyzerBase.InvalidResponseError("No plans");
        }
        if (analysis.reflection === undefined) {
            throw new LowLevelAnalyzerBase.InvalidResponseError("No reflections");
        }
        if (analysis.summary === undefined) {
            throw new LowLevelAnalyzerBase.InvalidResponseError("No summary");
        }
        if (Object.keys(results).length !== messages.length) {
            throw new LowLevelAnalyzerBase.InvalidResponseError(
                `${Object.keys(results).length} results for ${messages.length} messages`,
            );
        }
        // Check keys
        //for (let I = 0; I < Object.keys(Results).length; I++)
        //    if (!Results[I + 1]) throw new Error(`missing message ${I + 1}`);
        return Promise.resolve(results);
    }
}
