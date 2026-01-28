/**
 * Simple item-level deductive coder.
 *
 * This analyzer applies predefined codes from a codebook to each message in a conversation.
 * It provides a straightforward deductive coding implementation without specialized phrase
 * requirements (unlike verb-only or other constrained variants).
 *
 * Coding approach:
 * - Uses the codebook from incoming CodedThread (analysis.codes)
 * - LLM selects appropriate codes from the codebook for each message
 * - Multiple codes can be applied per message
 * - Codes are separated by semicolons
 * - Only codes from the predefined codebook should be used
 *
 * Chunking strategy:
 * - Processes conversations in adaptive chunks (~20-32 messages)
 * - Includes 3 messages from previous chunk as context (prefetch)
 * - Reduces chunk size on retry for reliability
 * - Adjusts based on model capabilities
 *
 * Prompt structure:
 * - System: Expert role + predefined codebook + research question + coding notes
 * - User: Numbered messages with optional preliminary codes
 * - Output: Thoughts + numbered code selections + summary + notes
 *
 * Use cases:
 * - Applying established theoretical frameworks to new data
 * - Validating existing coding schemes
 * - Ensuring consistency across multiple datasets
 * - Theory-driven analysis with predefined constructs
 *
 * @author John Chen
 */

import type { CodedThread, Conversation, Message } from "../../schema.js";
import type { AIParameters } from "../../steps/base-step.js";
import { BaseStep } from "../../steps/base-step.js";
import { buildMessagePrompt } from "../conversations.js";
import { ItemLevelCoderBase } from "./item-level.js";

/**
 * Concrete implementation of simple deductive item-level coding.
 *
 * Implements buildPrompts() to create prompts for deductive coding where the LLM
 * selects from a predefined codebook rather than generating new codes.
 *
 * @author John Chen
 */
export default class ItemLevelCoderSimple extends ItemLevelCoderBase {
    /** Unique identifier for this analyzer */
    override name = "item-deductive";

    /** LLM temperature (0.5 for balanced creativity and consistency) */
    override baseTemperature = 0.5;

    /** Term for singular code in prompts */
    protected override tagName = "code";

    /** Term for plural codes in prompts */
    protected override tagsName = "codes";

    /**
     * Create a new simple deductive coder.
     *
     * @param options - Optional configuration (name, prompt)
     */
    constructor(options?: { name?: string; prompt?: string }) {
        super(options);
    }

    /**
     * Configure chunk sizing with prefetch context.
     *
     * Adds 3-message prefetch from previous chunk to maintain coding consistency
     * across chunk boundaries. The context helps the LLM understand conversational
     * flow and apply codes more consistently.
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
    ): number | [number, number, number] {
        const { session } = BaseStep.Context.get();
        if (!session) {
            throw new BaseStep.ContextVarNotFoundError("session");
        }
        // Signal stop if no items remaining
        if (recommended === 0) {
            return -1;
        }
        return [Math.max(1, Math.floor(recommended / 2) - tries), 0, 0];
    }

    /**
     * Build prompts for deductive coding with predefined codebook.
     *
     * Creates a two-part prompt:
     * 1. System message: Role, predefined codebook, instructions, and output format
     * 2. User message: Numbered messages with optional preliminary codes
     *
     * The prompt:
     * - Lists all predefined codes from analysis.codes with their definitions
     * - Explicitly instructs LLM to use ONLY these codes
     * - Prohibits creating new codes
     * - Encourages selecting multiple appropriate codes per message
     * - Maintains output format consistency with inductive coders
     *
     * @param analysis - Current analysis state containing the codebook in analysis.codes
     * @param _target - Conversation being analyzed (unused)
     * @param messages - Messages in current chunk
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

        // Format codebook for prompt inclusion
        const codebookFormatted = this.formatCodebookForPrompt(analysis.codes);

        // Combine base customPrompt with runtime aiParams customPrompt
        const basePrompt = this.customPrompt || "";
        const runtimePrompt = aiParams?.customPrompt ? `\n${aiParams.customPrompt}` : "";
        const customPrompt = basePrompt + runtimePrompt;

        return Promise.resolve([
            `
# Goals
You are an expert in deductive qualitative coding.
Your goal is to accurately apply codes based on its definition from a predefined codebook to **every single data item**.

## Research Question
${dataset.researchQuestion.trim()}

## Coding Notes
${dataset.codingNotes.trim()}

## Special Instructions
${customPrompt?.trim()}

# Guidelines
1. Use ONLY the codes listed below and strictly follow its DEFINITION. Do not create new codes.
2. For each and every data item (provided in a numbered list), you MUST select zero (N/A), one or more appropriate codes from the codebook. Use "N/A" if nothing matches.
3. You will always return one bullet point for each data item. Multiple codes are splitted by semicolon (;). Only send out the correct LABEL.
4. When reasoning, carefully interpret through each data item to help with your decision-making following the coding instructions.
5. You can infer contexts from data before or after, but only apply codes for the item at hand. 
6. After you first-pass reasoning, justify why your choices follow the instruction and the code's DEFINITIONS. If mismatch, eliminate it.
7. Never not omit or provide selective answers.

# Predefined Codebook
${codebookFormatted}

# Output Format
\`\`\`
# Thoughts
{A paragraph of plans and guiding questions about analyzing the conversation}

# Codes (for each of the ${codingMessages.length} items):
1. {code 1}; {code 2}; ...
...
${codingMessages.length}. {code 1}; {code 2}; ...

# Summary
{A somewhat detailed summary of the data, including previous ones, without item IDs to avoid confusion}

# Notes
{Notes and hypotheses about the data until now}
\`\`\``.trim(),
            `${contextBlock}${codingMessages
                .map(
                    (message, idx) =>
                        `${idx + 1}. ${buildMessagePrompt(dataset, message, Object.keys(analysis.codes).length > 0 ? undefined : analysis.items[message.id], this.tagsName)}`,
                )
                .join("\n")}`,
        ]);
    }
}
