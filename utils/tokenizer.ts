import { encoding_for_model } from "@dqbd/tiktoken";

// This utils allows for estimating tokens for a given string.
// We don't need much accuracy, so we use 3.5-turbo/4 tokenizer for everything
// Encoding: Get the tokens from a string.
const Encoding = encoding_for_model("gpt-3.5-turbo");

// Tokenize: Get the tokens from a string.
export function Tokenize(Source: string): Uint32Array {
    return Encoding.encode(Source);
}
