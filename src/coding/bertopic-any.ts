/**
 * BERTopic-based conversation analysis with general labels.
 *
 * This file implements a hybrid machine learning + LLM approach to qualitative coding.
 * It uses BERTopic (a Python-based topic modeling library) to cluster messages by
 * semantic similarity, then uses an LLM to generate interpretable labels and definitions
 * for each discovered topic.
 *
 * Process flow:
 * 1. **Batch preprocessing**: Export all messages to JSON file
 * 2. **Topic modeling**: Run Python BERTopic script to cluster messages
 * 3. **LLM labeling**: For each topic, prompt LLM to generate a descriptive label
 * 4. **Code assignment**: Map topics back to individual messages
 *
 * Key features:
 * - Integrates Python ML pipeline with TypeScript LLM pipeline
 * - Processes entire dataset in single batch (no chunking)
 * - Generates topic clusters based on semantic embeddings
 * - Uses top examples and keywords to prompt LLM for labels
 * - Assigns codes at message level based on topic membership
 * - Handles multi-process communication with Python subprocess
 *
 * Technical architecture:
 * - TypeScript: Orchestration, LLM prompting, code assignment
 * - Python (bertopic_impl.py): BERTopic clustering, embedding generation
 * - Inter-process communication via temp files and stdout parsing
 *
 * This approach complements manual coding by:
 * - Discovering patterns across large datasets automatically
 * - Providing initial clustering that researchers can refine
 * - Identifying themes that might be missed in manual coding
 *
 * @author John Chen
 */

import { writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

import type { BertopicTopics, CodedThread, Conversation, Message } from "../schema.js";
import { BaseStep } from "../steps/base-step.js";
import { ensureFolder } from "../utils/io/file.js";
import { requestLLM } from "../utils/ai/llms.js";
import { logger } from "../utils/core/logger.js";
import { runPythonScript } from "../utils/runtime/python.js";

import { buildMessagePrompt, ConversationAnalyzer } from "./conversations.js";

/**
 * BERTopic-based analyzer with general label generation.
 *
 * This analyzer uses BERTopic for unsupervised topic discovery, then leverages
 * an LLM to generate human-readable labels for each topic. Unlike verb-based
 * variants, this analyzer accepts any label format from the LLM.
 *
 * Workflow:
 * 1. batchPreprocess(): Cluster all messages and generate labels
 * 2. parseResponse(): Assign pre-computed codes to messages
 *
 * The actual coding happens during batch preprocessing, with parseResponse
 * simply retrieving the stored codes for each message.
 *
 * @author John Chen
 */
export default class BertopicAnalyzerAny extends ConversationAnalyzer {
    /** The name of the analyzer. */
    override name = "bertopic-any";

    /** LLM temperature for label generation (0.5 for balanced creativity) */
    override baseTemperature = 0.5;

    /**
     * Message-to-code mapping generated during batch preprocessing.
     * Maps message IDs to their assigned topic labels.
     */
    #codes: Record<string, string> = {};

    /**
     * Determine chunk size for processing.
     *
     * BERTopic analyzers always process the entire dataset at once during
     * batch preprocessing, so this returns all remaining messages.
     *
     * @param _recommended - Recommended chunk size (ignored)
     * @param remaining - Number of remaining messages
     * @returns All remaining messages
     */
    override getChunkSize(_recommended: number, remaining: number) {
        return remaining;
    }

    /**
     * Perform BERTopic clustering and LLM label generation across all conversations.
     *
     * This is the core of the BERTopic analysis pipeline, executing these steps:
     *
     * 1. **Message collection**: Gather all messages from all conversations
     * 2. **Data export**: Write messages to JSON file for Python script
     * 3. **Topic modeling**: Execute BERTopic Python script to cluster messages
     * 4. **Result parsing**: Extract topic clusters with keywords and probabilities
     * 5. **LLM labeling**: For each topic:
     *    - Select top 5 examples by probability
     *    - Extract top 5 keywords
     *    - Prompt LLM to generate descriptive label
     *    - Parse and normalize label
     *    - Assign label to all messages in topic
     *
     * Inter-process communication:
     * - Output: ./known/bertopic.temp.json (formatted messages)
     * - Script: bertopic_impl.py (Python clustering script)
     * - Input: JSON topics data via stdout parsing
     *
     * LLM prompt structure:
     * - System: Expert in grounded theory + research question + coding notes
     * - User: Example quotes + keywords from BERTopic
     * - Output: Thought process + single descriptive label
     *
     * @param conversations - All conversations to analyze
     * @param _analyzed - Pre-existing analysis (unused)
     */
    override async batchPreprocess(
        conversations: Conversation[],
        _analyzed: CodedThread[],
    ): Promise<void> {
        await logger.withSource(this._prefix, "batchPreprocess", true, async () => {
            const { dataset } = BaseStep.Context.get();

            // === STEP 1: COLLECT AND FORMAT MESSAGES ===
            // Gather all messages from conversations, excluding subchunks and empty content
            const messages = conversations.flatMap((conversation) =>
                conversation.items.filter(
                    (message) =>
                        // TODO: Support subchunks in future
                        "content" in message &&
                        message.content.length > 0 &&
                        (!message.chunk || message.chunk === conversation.id),
                ),
            );

            // Format messages for BERTopic using shortened speaker names
            // Replace newlines with spaces to create single-line entries
            const content = messages.map((message) =>
                // TODO: Support subchunks in future
                "content" in message
                    ? buildMessagePrompt(dataset, message, undefined, undefined, true).replaceAll(
                          "\n",
                          " ",
                      )
                    : "",
            );

            // === STEP 2: EXPORT DATA FOR PYTHON SCRIPT ===
            ensureFolder("./known");
            writeFileSync("./known/bertopic.temp.json", JSON.stringify(content));

            // === STEP 3: RUN BERTOPIC CLUSTERING ===
            // Execute Python script and parse JSON output from stdout
            let topics: BertopicTopics = {};
            const __dirname = dirname(fileURLToPath(import.meta.url));
            await runPythonScript(resolve(__dirname, "bertopic_impl.py"), {
                args: [messages.length.toString()],
                parser: (message) => {
                    if (message.startsWith("{")) {
                        // Successfully received JSON topics data
                        logger.success(message);
                        topics = JSON.parse(message) as BertopicTopics;
                    } else {
                        // Log Python script warnings/errors
                        logger.warn(message);
                    }
                },
            });

            // === STEP 4: GENERATE LLM LABELS FOR EACH TOPIC ===
            for (const topic of Object.values(topics)) {
                // Sort message IDs by topic membership probability (highest first)
                const ids = topic.ids.sort(
                    (A, B) => topic.probabilities[B] - topic.probabilities[A],
                );

                // Select top 5 most representative examples for LLM prompt
                const examples = ids.slice(0, 5).map((ID) => messages[ID]);

                // Build system prompt with research context
                const prompt = `
You are an expert in thematic analysis with grounded theory, working on open coding.
You identified a topic from the input quotes. Each quote is independent from another.
${dataset.researchQuestion}
${dataset.codingNotes}${this.customPrompt}

Always follow the output format:
===
Thought: {What is the most common theme among the input quotes? Do not over-interpret the data.}
Label: {A single label that faithfully describes the topic}
===`.trim();

                // Extract top 5 keywords from BERTopic's TF-IDF analysis
                const keywords = topic.keywords.slice(0, 5);

                // Request LLM to generate descriptive label
                const response = await requestLLM(
                    [
                        { role: "system", content: prompt },
                        {
                            role: "user",
                            content: `Quotes:
${examples
    .map((message) =>
        // TODO: Support subchunks in future
        "content" in message
            ? `- ${buildMessagePrompt(dataset, message, undefined, undefined, true)}`
            : "",
    )
    .join("\n")}
Keywords: ${keywords.join(", ")}`.trim(),
                        },
                    ],
                    `messaging-groups/${this.name}`,
                    this.baseTemperature,
                    false,
                );

                // Parse label from response
                let phrase = "";
                const lines = response.split("\n");
                for (const _line of lines) {
                    const line = _line.trim();
                    if (line.startsWith("Label:")) {
                        phrase = line.slice(6).trim().toLowerCase();
                        // Remove trailing period if present
                        if (phrase.endsWith(".")) {
                            phrase = phrase.slice(0, -1);
                        }
                    }
                }

                // Assign the generated label to all messages in this topic
                for (const id of ids) {
                    this.#codes[messages[id].id] = phrase;
                }
            }
        });
    }

    /**
     * Retrieve pre-computed codes for messages.
     *
     * BERTopic analysis happens entirely in batchPreprocess(), so this method
     * simply looks up the codes that were already assigned during clustering.
     *
     * @param _analysis - CodedThread (unused)
     * @param _lines - LLM response lines (unused, no LLM call here)
     * @param subunits - Messages to retrieve codes for
     * @param _chunkStart - Chunk start index (unused)
     * @param _iteration - Iteration number (unused)
     * @returns Map of 1-based indices to code strings
     */
    override parseResponse(
        _analysis: CodedThread,
        _lines: string[],
        subunits: Message[],
        _chunkStart: number,
        _iteration: number,
    ): Promise<Record<number, string>> {
        const results: Record<number, string> = {};

        for (let i = 0; i < subunits.length; i++) {
            let code = this.#codes[subunits[i].id] ?? "";

            // Clean up any residual formatting from LLM label generation
            if (code.endsWith(".")) {
                code = code.slice(0, -1);  // Remove trailing period
            }
            if (code.startsWith('"') && code.endsWith('"')) {
                code = code.slice(1, -1);  // Remove surrounding quotes
            }

            // Store with 1-based indexing
            results[i + 1] = code;
        }

        return Promise.resolve(results);
    }
}
