/**
 * Item-level conversation analyzer with general phrase coding.
 *
 * This analyzer conducts message-by-message coding using general interpretive phrases.
 * Unlike verb-based variants, it accepts any descriptive label format from the LLM,
 * allowing for flexible coding that can include nouns, adjectives, or mixed formats.
 *
 * Coding approach:
 * - Each message receives one or more interpretive phrases
 * - Phrases balance specificity with cross-message generalizability
 * - LLM considers multiple theoretical angles simultaneously
 * - Codes are separated by semicolons (e.g., "Greeting; Enthusiasm; Question")
 *
 * Chunking strategy:
 * - Processes conversations in adaptive chunks (recommended size ~20-32 messages)
 * - Includes 3 messages from previous chunk as context (prefetch)
 * - Reduces chunk size on retry for reliability
 * - Adjusts based on model capabilities (strong vs. weak models)
 *
 * Prompt structure:
 * - System: Expert role + research question + coding notes
 * - User: Numbered messages with optional preliminary codes
 * - Output: Thoughts + numbered interpretations + summary + notes
 *
 * Use cases:
 * - Exploratory coding where code format should emerge naturally
 * - Mixed-method analysis needing diverse code types
 * - Studies where actions, states, and attributes are all relevant
 *
 * @author John Chen
 */

import type { CodedThread, Conversation, Message } from "../schema.js";
import type { AIParameters } from "../steps/base-step.js";
import { BaseStep } from "../steps/base-step.js";

import { buildMessagePrompt } from "./conversations.js";
import { ItemLevelAnalyzerBase } from "./item-level.js";

/**
 * Concrete item-level analyzer using general phrase coding.
 *
 * Implements buildPrompts() to create prompts for flexible, multi-angle coding
 * with phrases that can be nouns, verbs, adjectives, or mixed formats.
 *
 * @author John Chen
 */
export default class ItemLevelAnalyzerAny extends ItemLevelAnalyzerBase {
    /** Unique identifier for this analyzer */
    override name = "item-any";

    /** LLM temperature (0.5 for balanced creativity and consistency) */
    override baseTemperature = 0.5;

    /** Term for singular code in prompts */
    protected override tagName = "phrase";

    /** Term for plural codes in prompts */
    protected override tagsName = "phrases";

    /**
     * Configure chunk sizing with prefetch context.
     *
     * This override adds 3-message prefetch from previous chunk to maintain
     * coding consistency across chunk boundaries. The context helps the LLM
     * understand conversational flow and apply codes more consistently.
     *
     * Strategy:
     * - Strong models: recommended - (tries * 2), with max(8, ...) prefetch
     * - Weak models: recommended - (tries * 8), with 3 prefetch
     *
     * @param recommended - Recommended chunk size based on context window
     * @param _remaining - Remaining messages (unused)
     * @param _iteration - Iteration number (unused)
     * @param tries - Retry attempts for this chunk
     * @returns [chunkSize, prefetchSize, postfetchSize]
     */
    override getChunkSize(
        recommended: number,
        _remaining: number,
        _iteration: number,
        tries: number,
    ): [number, number, number] {
        const { session } = BaseStep.Context.get();
        if (!session) {
            throw new BaseStep.ContextVarNotFoundError("session");
        }

        // Weak model: Aggressive reduction with fixed prefetch
        if (recommended === (session.config.batchSize ?? 32)) {
            return [recommended - tries * 8, 3, 0];
        }

        // Strong model: Gradual reduction with adaptive prefetch
        return [recommended - tries * 2, Math.max(8 - recommended - tries, 3), 0];
    }

    /**
     * Build prompts for general phrase coding.
     *
     * Creates a two-part prompt:
     * 1. System message: Role, instructions, and output format
     * 2. User message: Numbered messages with optional preliminary codes
     *
     * The prompt encourages:
     * - Multi-angle theoretical analysis
     * - Balance between specificity and generalizability
     * - Multiple interpretive phrases per message
     * - No repetition of input text in codes
     *
     * @param analysis - Current analysis state with preliminary codes
     * @param _target - Conversation being analyzed (unused)
     * @param messages - Messages in current chunk
     * @param chunkStart - Starting index of chunk
     * @param _iteration - Current iteration number (unused)
     * @param aiParams - Optional AI parameters for runtime configuration
     * @returns [systemPrompt, userPrompt]
     */
    override buildPrompts(
        analysis: CodedThread,
        _target: Conversation,
        messages: Message[],
        contexts: Message[],
        chunkStart: number,
        _iteration: number,
        aiParams?: AIParameters,
    ): Promise<[string, string]> {
        const { dataset } = BaseStep.Context.get();

        // Extract messages to code (from chunkStart onwards)
        const codingMessages = messages.slice(chunkStart);

        // Build context block from contexts array
        const contextBlock = this.buildContextBlock(contexts);

        // Combine base customPrompt with runtime aiParams customPrompt
        const basePrompt = this.customPrompt || "";
        const runtimePrompt = aiParams?.customPrompt ? `\n${aiParams.customPrompt}` : "";
        const customPrompt = basePrompt + runtimePrompt;

        return Promise.resolve([
            `
You are an expert in thematic analysis with grounded theory, working on open coding.
Your goal is to identify multiple low-level tags for each message.
When writing tags, balance between specifics and generalizability across messages. Do not repeat the input text.
${dataset.researchQuestion}
${dataset.codingNotes}${customPrompt?.trim()}

Always follow the output format:
---
Thoughts: {A paragraph of plans and guiding questions about analyzing the conversation from multiple theoretical angles}
Interpretations for each message (${codingMessages.length} in total):
1. {phrase 1}; {phrase 2}; ...
...
${codingMessages.length}. {phrase 1}; {phrase 2}; ...
Summary: {A somehow detailed summary of the conversation, including previous ones}
Notes: {Notes and hypotheses about the conversation until now}`.trim(),
            `${contextBlock}${codingMessages
                .map(
                    (message, idx) =>
                        `${idx + 1}. ${buildMessagePrompt(dataset, message, analysis.items[message.id], this.tagsName)}`,
                )
                .join("\n")}`,
        ]);
    }
}
