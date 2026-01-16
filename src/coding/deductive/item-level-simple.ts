/**
 * Simple item-level deductive coder.
 *
 * This analyzer applies predefined codes from a codebook to each message in a conversation.
 * It provides a straightforward deductive coding implementation without specialized phrase
 * requirements (unlike verb-only or other constrained variants).
 *
 * Coding approach:
 * - Receives a predefined codebook with codes and definitions
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

import type { Codebook, CodedThread, Conversation, Message } from "../../schema.js";
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
     * @param codebook - The predefined codebook with codes and definitions
     * @param options - Optional configuration (name, prompt)
     */
    constructor(codebook: Codebook, options?: { name?: string; prompt?: string }) {
        super(codebook, options);
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
     * Build prompts for deductive coding with predefined codebook.
     *
     * Creates a two-part prompt:
     * 1. System message: Role, predefined codebook, instructions, and output format
     * 2. User message: Numbered messages with optional preliminary codes
     *
     * Before building prompts:
     * - Prefills analysis.codes with codebook structure (definitions but no examples)
     *
     * The prompt:
     * - Lists all predefined codes with their definitions
     * - Explicitly instructs LLM to use ONLY these codes
     * - Prohibits creating new codes
     * - Encourages selecting multiple appropriate codes per message
     * - Maintains output format consistency with inductive coders
     *
     * @param analysis - Current analysis state (will be prefilled with codebook)
     * @param _target - Conversation being analyzed (unused)
     * @param messages - Messages in current chunk
     * @returns [systemPrompt, userPrompt]
     */
    override buildPrompts(
        analysis: CodedThread,
        _target: Conversation,
        messages: Message[],
    ): Promise<[string, string]> {
        const { dataset } = BaseStep.Context.get();

        // Prefill analysis.codes with codebook structure before coding begins
        this.prefillCodesFromCodebook(analysis, this.codebook);

        // Format codebook for prompt inclusion
        const codebookFormatted = this.formatCodebookForPrompt(this.codebook);

        return Promise.resolve([
            `
# Goals
You are an expert in deductive qualitative coding.
Your goal is to accurately apply codes from a predefined codebook to each data item.
Use ONLY the codes listed below. Do not create new codes.
For each message, select one or more appropriate codes from the codebook. Use "N/A" if nothing matches.
${dataset.researchQuestion}
${dataset.codingNotes}${this.customPrompt}

# Predefined Codebook
${codebookFormatted}

# Output Format
\`\`\`
# Thoughts
{A paragraph of plans and guiding questions about analyzing the conversation}

# Codes (${messages.length} in total):
1. {code 1}; {code 2}; ...
...
${messages.length}. {code 1}; {code 2}; ...

# Summary
{A somewhat detailed summary of the data, including previous ones}

# Notes
{Notes and hypotheses about the data until now}
\`\`\``.trim(),
            messages
                .map(
                    (message, idx) =>
                        `${idx + 1}. ${buildMessagePrompt(dataset, message, analysis.items[message.id], this.tagsName)}`,
                )
                .join("\n"),
        ]);
    }
}
