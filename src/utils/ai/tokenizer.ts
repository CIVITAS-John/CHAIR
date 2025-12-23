/**
 * Token Estimation Utilities
 *
 * This module provides token counting for text strings using the GPT-3.5-turbo tokenizer.
 * While not perfectly accurate for all models, it provides a good enough approximation for:
 * - Cost estimation before making API calls
 * - Tracking token usage across sessions
 * - Ensuring prompts fit within model context windows
 *
 * The tokenizer uses tiktoken's BPE (Byte Pair Encoding) implementation which is the same
 * tokenization method used by OpenAI models. Other model families (Claude, Gemini, etc.)
 * use slightly different tokenization, but the difference is typically <10% which is
 * acceptable for estimation purposes.
 */

import { encoding_for_model } from "@dqbd/tiktoken";

// Initialize the GPT-3.5-turbo tokenizer once for reuse
// We use GPT-3.5-turbo as a universal approximation - it's fast and accurate enough
const encoding = encoding_for_model("gpt-3.5-turbo");

/**
 * Tokenize a string and return the token array
 *
 * Uses the GPT-3.5-turbo tokenizer (BPE) as a universal approximation for all models.
 * This is intentionally a "good enough" solution - perfect token counting per model
 * would require loading multiple tokenizers and adds unnecessary complexity.
 *
 * @param text - The text string to tokenize
 * @returns Uint32Array of token IDs, or empty array if text is invalid
 *
 * @example
 * const tokens = tokenize("Hello, world!");
 * console.log(tokens.length); // Approximate token count
 */
export const tokenize = (text: string) =>
    typeof text.charCodeAt !== "function" ? new Uint32Array(0) : encoding.encode(text);
