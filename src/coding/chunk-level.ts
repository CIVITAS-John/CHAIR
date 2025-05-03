import type { Code, CodedThread, Message } from "../schema.js";
import { assembleExampleFrom } from "../utils/misc.js";

import { ConversationAnalyzer, revertMessageFormat } from "./conversations.js";

/**
 * Conduct the first-round chunk-level coding of the conversations.
 * @author John Chen
 */
export abstract class ChunkLevelAnalyzerBase extends ConversationAnalyzer {
    /**
     * Get the chunk size and cursor movement for the LLM.
     * @returns [Chunk size, Cursor movement]
     */
    override getChunkSize(_recommended: number, remaining: number) {
        return remaining;
    }

    /** Parse the responses from the LLM. */
    override parseResponse(
        analysis: CodedThread,
        lines: string[],
        messages: Message[],
        _chunkStart: number,
    ): Promise<number> {
        let category = "";
        let position = "";
        let currentCode: Code | undefined;
        // Parse the response
        for (let line of lines) {
            if (line.startsWith("* Summary")) {
                analysis.summary = line.substring(9).trim();
                if (analysis.summary === "") {
                    position = "Summary";
                }
            } else if (line.startsWith("* Plan")) {
                analysis.plan = line.substring(8).trim();
                if (analysis.plan === "") {
                    position = "Plan";
                }
            } else if (line.startsWith("# ")) {
                position = "";
                category = line.substring(2).trim();
            } else if (line.startsWith("## ")) {
                position = "";
                line = line.substring(3).trim();
                // Sometimes, the LLM will return "P{number}" as the name of the code
                if (/^P\d+(?:$|:)/.exec(line)) {
                    throw new Error(`Invalid code name: ${line}.`);
                }
                // Sometimes, the LLM will return "**{code}**" as the name of the code
                line = line.replace(/^\*\*(.*)\*\*/, "$1").trim();
                // Sometimes, the LLM will return "1. {code}" as the name of the code
                line = line.replace(/^\d+\.*/, "").trim();
                // Sometimes, the LLM will return "Label: {code}" as the name of the code
                line = line.replace(/^(?:Label|Code)\s*\d*:/, "").trim();
                // Get or create the code
                line = line.toLowerCase();
                currentCode = analysis.codes[line] ?? {
                    categories: [category.toLowerCase()],
                    label: line,
                };
                analysis.codes[line] = currentCode;
            } else if (line.startsWith("Definition: ")) {
                // Add the definition to the current code
                if (currentCode) {
                    line = line.substring(12).trim();
                    currentCode.definitions = [line];
                }
            } else if (position === "Summary") {
                analysis.summary = `${analysis.summary}\n${line.trim()}`.trim();
            } else if (position === "Plan") {
                analysis.plan = `${analysis.plan}\n${line.trim()}`.trim();
            } else if (line.startsWith("- ")) {
                // Add examples to the current code
                if (currentCode) {
                    line = line.substring(2).trim();
                    // Find the format (ID: 123)
                    let Index = line.lastIndexOf("(ID:");
                    if (Index !== -1) {
                        const ID = parseInt(line.substring(Index + 4, line.length - 1));
                        line = line.substring(0, Index).trim();
                        Index = ID;
                    }
                    // Sometimes the LLM will return "Example quote 1: quote"
                    line = line.replace(/^Example quote \d+:/, "").trim();
                    // Sometimes the LLM will return "tag{number}: {codes}"
                    line = line.replace(/^tag\d+:/, "").trim();
                    // Sometimes the LLM will return `"quote" (Author)`
                    line = line.replace(/^"(.*)"/, "$1").trim();
                    // Sometimes the LLM will return `quote (Author)`
                    line = line.replace(/^([^(]*)\(.+\)$/, "$1").trim();
                    // Sometimes the LLM will return `**{quote}**`
                    line = line.replace(/^\*\*(.*)\*\*/, "$1").trim();
                    // Sometimes the LLM will return `User/Designer-\d+: {quote}`
                    line = line.replace(/^(?:User|Designer)-\d+:/, "").trim();
                    // Revert the image and checkin tags
                    line = revertMessageFormat(line);
                    // Add the example if it is not already in the list
                    currentCode.examples = currentCode.examples ?? [];
                    let message = messages.find((m) => m.content === line);
                    if (!message) {
                        let lowerLine = line.toLowerCase();
                        // Remove everything after "..."
                        const Index = lowerLine.indexOf("...");
                        if (Index !== -1) {
                            lowerLine = lowerLine.substring(0, Index).trim();
                        }
                        if (lowerLine.endsWith(".")) {
                            lowerLine = lowerLine.substring(0, lowerLine.length - 1);
                        }
                        message = messages.find((m) => {
                            const lower = m.content.toLowerCase();
                            return lower.includes(lowerLine) || lowerLine.includes(lower);
                        });
                    }
                    if (!message) {
                        console.log(
                            `Cannot find the coded message for: ${line}. The LLM has likely slightly changed the content.`,
                        );
                    }
                    const example = message ? assembleExampleFrom(this.dataset, message) : line;
                    if (message && !currentCode.examples.includes(example)) {
                        currentCode.examples.push(example);
                    }
                }
            }
        }
        // Remove the "..." code
        delete analysis.codes["..."];
        // This analyzer does not conduct item-level coding.
        return Promise.resolve(0);
    }
}
