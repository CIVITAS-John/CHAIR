/**
 * EDGE CASE: Item-level analyzer with excessive code generation (flooding).
 *
 * ⚠️ WARNING: DO NOT USE FOR PRODUCTION RESEARCH! ⚠️
 *
 * This analyzer is intentionally designed as a "bad actor" to test system robustness
 * and explore the limits of LLM-based coding. It instructs the LLM to generate
 * an excessive number of codes per message (>20 phrases each).
 *
 * Purpose:
 * - Test downstream consolidation and analysis steps
 * - Evaluate system performance with extreme code volumes
 * - Explore LLM behavior under unusual constraints
 * - Develop strategies for detecting and handling over-coding
 * - Benchmark code quality vs. quantity trade-offs
 *
 * Behavioral characteristics:
 * - Generates 20+ codes per message (vs. typical 2-5)
 * - Creates highly redundant and overlapping codes
 * - May produce low-quality, superficial interpretations
 * - Tests limits of code normalization and deduplication
 * - Challenges consolidation algorithms
 *
 * Research applications:
 * - NOT suitable for actual qualitative research
 * - Useful for methodological studies on LLM coding
 * - Helps develop quality control mechanisms
 * - Informs best practices for prompt engineering
 * - Tests robustness of analysis pipelines
 *
 * Comparison to ItemLevelAnalyzerAny:
 * - Any: "identify multiple low-level tags"
 * - Flooding: "always generate more than 20 phrases"
 * - Any: Quality-focused
 * - Flooding: Quantity-focused (intentionally problematic)
 *
 * Implementation note:
 * This is nearly identical to ItemLevelAnalyzerAny except for the prompt
 * modification requesting excessive code generation.
 *
 * @author John Chen
 */

import type { CodedThread, Conversation, Message } from "../../schema.js";
import { BaseStep } from "../../steps/base-step.js";
import { buildMessagePrompt } from "../conversations.js";
import { ItemLevelAnalyzerBase } from "../item-level.js";

/**
 * Edge case analyzer for testing excessive code generation.
 *
 * ⚠️ FOR TESTING ONLY - NOT FOR PRODUCTION RESEARCH ⚠️
 *
 * Deliberately generates excessive codes to test system limits.
 *
 * @author John Chen
 */
export default class ItemLevelAnalyzerFlooding extends ItemLevelAnalyzerBase {
    /** Analyzer identifier */
    override name = "item-flooding";

    /** LLM temperature */
    override baseTemperature = 0.5;

    /** Singular code term in prompts */
    protected override tagName = "phrase";

    /** Plural code term in prompts */
    protected override tagsName = "phrases";

    /**
     * Chunk sizing (identical to ItemLevelAnalyzerAny).
     *
     * Uses same adaptive chunking strategy as production analyzer to ensure
     * comparable processing conditions when testing edge cases.
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

        // Weak model strategy
        if (recommended === (session.config.batchSize ?? 32)) {
            return [recommended - tries * 8, 3, 0];
        }

        // Strong model strategy
        return [recommended - tries * 2, Math.max(8 - recommended - tries, 3), 0];
    }

    /**
     * Build prompts with flooding requirement.
     *
     * ⚠️ KEY DIFFERENCE: Adds "always generate more than 20 phrases for each message"
     *
     * This intentionally creates problematic over-coding to test system limits
     * and evaluate quality control mechanisms.
     *
     * @param analysis - Current analysis state
     * @param _target - Conversation (unused)
     * @param messages - Messages to code
     * @param _chunkStart - Chunk start (unused)
     * @returns [systemPrompt, userPrompt]
     */
    override buildPrompts(
        analysis: CodedThread,
        _target: Conversation,
        messages: Message[],
        _chunkStart: number,
    ): Promise<[string, string]> {
        const { dataset } = BaseStep.Context.get();
        return Promise.resolve([
            `
You are an expert in thematic analysis with grounded theory, working on open coding.
Your goal is to identify multiple low-level tags for each message.
When writing tags, balance between specifics and generalizability across messages. Do not repeat the input text.
${dataset.researchQuestion}
${dataset.codingNotes}
⚠️ Special requirement: always generate more than 20 phrases for each message.

Always follow the output format:
---
Thoughts: {A paragraph of plans and guiding questions about analyzing the conversation from multiple theoretical angles}
Interpretations for each message (${messages.length} in total):
1. {phrase 1}; {phrase 2}; ...
...
${messages.length}. {phrase 1}; {phrase 2}; ...
Summary: {A somehow detailed summary of the conversation, including previous ones}
Notes: {Notes and hypotheses about the conversation until now}`.trim(),
            messages
                .map(
                    (message, idx) =>
                        `${idx + 1}. ${buildMessagePrompt(dataset, message, analysis.items[message.id], this.tagsName)}`,
                )
                .join("\n"),
        ]);
    }
}
