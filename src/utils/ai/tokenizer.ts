import { encoding_for_model } from "@dqbd/tiktoken";

// This utils allows for estimating tokens for a given string.
// We don't need much accuracy, so we use 3.5-turbo/4 tokenizer for everything
const encoding = encoding_for_model("gpt-3.5-turbo");

// Get the tokens from a string.
export const tokenize = (text: string) =>
    typeof text.charCodeAt !== "function" ? new Uint32Array(0) : encoding.encode(text);
