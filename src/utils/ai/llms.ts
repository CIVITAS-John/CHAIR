/**
 * LLM Request Management and Caching
 *
 * This module provides centralized LLM (Large Language Model) request handling with built-in caching,
 * token tracking, and support for multiple model providers (OpenAI, Anthropic, Google, Groq, Mistral, Ollama).
 *
 * Key Features:
 * - Automatic response caching based on MD5 hash of input messages and temperature
 * - Token usage tracking per session for cost monitoring
 * - Support for both cloud-based and local (Ollama) models
 * - Configurable temperature and timeout settings per model
 * - Automatic stripping of <think> tags for reasoning models
 *
 * Cache Strategy:
 * - Cache files stored in: known/{cache_name}/{model_name}/{md5(input)}-{temperature}.txt
 * - Format: "{input}\n===\n{output}" - allows cache validation by checking input matches
 * - MD5 collision risk is acceptable for this use case (caching duplicate prompts as same response)
 *
 * Request Flow:
 * 1. requestLLM() called with messages, cache name, and temperature
 * 2. Generate MD5 hash of concatenated message contents
 * 3. Check if cache file exists at known/{cache}/{model}/{hash}-{temp}.txt
 * 4. If cache hit: read file, parse output, update token counts, return stripped response
 * 5. If cache miss: call requestLLMWithoutCache() to invoke model API
 * 6. Write response to cache file, update token counts, return stripped response
 *
 * Token Tracking:
 * - All requests update session.inputTokens and session.outputTokens
 * - Even cached responses are counted to track "virtual" costs
 * - Token counts estimated using GPT-3.5-turbo tokenizer (good enough approximation)
 */

import { existsSync, readFileSync, writeFileSync } from "fs";

import { ChatAnthropic } from "@langchain/anthropic";
import type {
    BaseChatModel,
    BaseChatModelCallOptions,
} from "@langchain/core/language_models/chat_models";
import type { BaseMessage } from "@langchain/core/messages";
import { HumanMessage } from "@langchain/core/messages";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatGroq } from "@langchain/groq";
import { ChatMistralAI } from "@langchain/mistralai";
import { ChatOllama } from "@langchain/ollama";
import { ChatOpenAI } from "@langchain/openai";
import * as dotenv from "dotenv";
import md5 from "md5";

import { BaseStep } from "../../steps/base-step.js";

import { ensureFolder } from "../io/file.js";
import { logger } from "../core/logger.js";
import { promiseWithTimeout } from "../core/misc.js";
import { tokenize } from "./tokenizer.js";

/**
 * Configuration for available LLM models.
 * Each model defines input/output limits and instantiation logic.
 * Comments indicate approximate costs in $/1M tokens (input/output)
 */
const MODELS = {
    "gpt-3.5-turbo": {
        // 0.5$ / 1.5$
        maxInput: 16385,
        maxOutput: 4096,
        maxItems: 32,
        model: (temperature) =>
            new ChatOpenAI({
                temperature,
                model: "gpt-3.5-turbo",
                streaming: false,
                maxTokens: 4096,
            }),
    },
    "gpt-4o": {
        // 2.5$ / 10$
        maxInput: 16385,
        maxOutput: 4096,
        maxItems: 64,
        model: (temperature) =>
            new ChatOpenAI({
                temperature,
                model: "gpt-4o",
                streaming: false,
                maxTokens: 4096,
            }),
    },
    "gpt-4.1": {
        // 2$ / 8$
        maxInput: 16385,
        maxOutput: 4096,
        maxItems: 64,
        model: (temperature) =>
            new ChatOpenAI({
                temperature,
                model: "gpt-4.1",
                streaming: false,
                maxTokens: 4096,
            }),
    },
    "gpt-4o-mini": {
        // 0.15$ / 0.6$
        maxInput: 16385,
        maxOutput: 4096,
        maxItems: 64,
        model: (temperature) =>
            new ChatOpenAI({
                temperature,
                model: "gpt-4o-mini",
                streaming: false,
                maxTokens: 4096,
            }),
    },
    "gpt-4o-audio": {
        // 2.5$ / 10$
        // 100$ / 200$ audio
        maxInput: 16385,
        maxOutput: 4096,
        maxItems: 64,
        model: (temperature) =>
            new ChatOpenAI({
                temperature,
                model: "gpt-4o-audio-preview",
                streaming: false,
                maxTokens: 4096,
            }),
    },
    "o4-mini": {
        // 1.1$ / 4.4$
        maxInput: 16385,
        maxOutput: 4096,
        maxItems: 64,
        systemMessage: false,
        model: () =>
            new ChatOpenAI({
                // Does not support temperature
                model: "o4-mini",
                streaming: false,
                // maxCompletionTokens: MaxOutput,
                // need to update the package, it seems
            }),
    },
    "claude-4.5-haiku": {
        // 1$ / 5$
        maxInput: 200000,
        maxOutput: 32000,
        maxItems: 64,
        model: (temperature) =>
            new ChatAnthropic({
                temperature,
                model: "claude-4-5-haiku",
                streaming: false,
                maxTokens: 32000,
            }),
    },
    "claude-4.5-sonnet": {
        // 3$ / 15$
        maxInput: 200000,
        maxOutput: 32000,
        maxItems: 64,
        model: (temperature) =>
            new ChatAnthropic({
                temperature,
                model: "claude-4-5-sonnet",
                streaming: false,
                maxTokens: 32000,
            }),
    },
    "llama3.3-70b": {
        // 0.59$ / 0.79$
        maxInput: 8192,
        maxOutput: 8192,
        maxItems: 32,
        model: (temperature) =>
            new ChatGroq({
                temperature,
                model: "llama-3.3-70b-versatile",
                streaming: false,
                maxTokens: 8192,
            }),
    },
    "gemini-3-pro": {
        // 0.5$ / 3$
        maxInput: 200000,
        maxOutput: 32000,
        maxItems: 64,
        model: (temperature) =>
            new ChatGoogleGenerativeAI({
                temperature,
                model: "gemini-3-pro",
                streaming: false,
            }),
    },
    "gemini-3-flash": {
        // 0.5$ / 3$
        maxInput: 200000,
        maxOutput: 32000,
        maxItems: 64,
        model: (temperature) =>
            new ChatGoogleGenerativeAI({
                temperature,
                model: "gemini-3-pro",
                streaming: false,
            }),
    },
    "gemma3-27b": {
        maxInput: 32000,
        maxOutput: 32000,
        maxItems: 32,
        model: (temperature) =>
            new ChatGoogleGenerativeAI({
                temperature,
                model: "gemma-3-27b-it",
                streaming: false,
            }),
    }
} satisfies Record<string, Omit<LLMObject, "name" | "model"> & Partial<Pick<LLMObject, "model">>>;

/** Type representing the names of all predefined LLM models */
export type LLMName = keyof typeof MODELS;

/**
 * Configuration object for an LLM model instance
 *
 * @property model - Factory function that creates a configured LangChain chat model
 * @property name - Human-readable name/identifier for the model
 * @property maxInput - Maximum input tokens the model can accept
 * @property maxOutput - Maximum output tokens the model can generate
 * @property maxItems - Maximum number of items to process in a batch
 * @property local - Whether this is a locally-hosted model (e.g., Ollama)
 * @property systemMessage - Whether the model supports system messages (some reasoning models don't)
 */
export interface LLMObject {
    model: (temperature: number) => BaseChatModel;
    name: string;
    maxInput: number;
    maxOutput: number;
    maxItems: number;
    local?: boolean;
    systemMessage?: boolean;
}

/**
 * Options for initializing a custom Ollama LLM
 *
 * @property name - Identifier for this model configuration
 * @property model - Optional Ollama model name (defaults to name if not provided)
 * @property maxInput - Maximum input tokens (defaults to 8192)
 * @property maxOutput - Maximum output tokens (defaults to 8192)
 * @property maxItems - Maximum batch size (defaults to 32)
 * @property baseUrl - Ollama server URL (defaults to OLLAMA_URL env var or localhost:11434)
 * @property systemMessage - Whether model supports system messages (defaults to true)
 */
export interface OllamaLLMOptions {
    name: string;
    model?: string;
    maxInput?: number;
    maxOutput?: number;
    maxItems?: number;
    baseUrl?: string;
    systemMessage?: boolean;
}

/** Type accepting either a predefined model name or a custom LLMObject */
export type LLMModel = LLMName | LLMObject;

/**
 * Error thrown when attempting to use an unsupported or unavailable LLM model
 */
export class LLMNotSupportedError extends Error {
    override name = "LLMNotSupportedError";
    constructor(model: string, local = false) {
        super(local ? `LLM ${model} is local only through ollama` : `LLM ${model} not supported`);
    }
}

/**
 * Session object tracking LLM usage and progress for a single model across multiple requests
 *
 * @property llm - The LLM configuration being used
 * @property inputTokens - Cumulative input tokens consumed across all requests
 * @property outputTokens - Cumulative output tokens generated across all requests
 * @property expectedItems - Total number of items expected to be processed
 * @property finishedItems - Number of items successfully processed so far
 */
export interface LLMSession {
    llm: LLMObject;
    inputTokens: number;
    outputTokens: number;
    expectedItems: number;
    finishedItems: number;
}

dotenv.config();

/**
 * Initialize a custom Ollama LLM with the given configuration
 *
 * Ollama allows running open-source LLMs locally. This function creates an LLMObject
 * configured to connect to a local Ollama server.
 *
 * @param options - Configuration for the Ollama model
 * @returns Configured LLMObject ready for use in requests
 *
 * @example
 * const customModel = initOllamaLLM({
 *   name: "my-llama3",
 *   model: "llama3:8b",
 *   maxInput: 8192,
 *   baseUrl: "http://localhost:11434"
 * });
 */
export const initOllamaLLM = (options: OllamaLLMOptions): LLMObject => {
    return {
        name: options.name,
        model: (temperature) =>
            new ChatOllama({
                temperature,
                model: options.model ?? options.name,
                streaming: false,
                baseUrl: options.baseUrl ?? process.env.OLLAMA_URL ?? "https://127.0.0.1:11434",
            }),
        maxInput: options.maxInput ?? 8192,
        maxOutput: options.maxOutput ?? 8192,
        maxItems: options.maxItems ?? 32,
        systemMessage: options.systemMessage ?? true,
        local: true,
    };
};

/**
 * Initialize an LLM by name with support for experiment variants and Ollama models
 *
 * Naming Conventions:
 * - "o_{model}" or "o_{model}_{tag}" - Routes to Ollama with specific tag (e.g., "o_llama3_70b" -> "llama3:70b")
 * - "{model}_0" - Experiment variant (suffix stripped before lookup)
 * - "{model}_{n}" - Multiple experiment variants supported
 *
 * @param LLM - Model name or experiment variant name
 * @returns Configured LLMObject for the requested model
 * @throws {LLMNotSupportedError} If model name not found in MODELS configuration
 *
 * @example
 * // Standard model
 * const gpt = initLLM("gpt-4o");
 *
 * @example
 * // Ollama variant
 * const localModel = initLLM("o_llama3_70b"); // Uses Ollama with model "llama3:70b"
 *
 * @example
 * // Experiment variant
 * const experiment = initLLM("claude3.5-sonnet_0"); // Uses claude3.5-sonnet configuration
 */
export const initLLM = (LLM: string): LLMObject => {
    // Handle the multiple experiments
    let realLLM = LLM;

    // ollama Support
    if (LLM.startsWith("o_")) {
        let ollama = LLM.substring(2);
        if (ollama.includes("_")) {
            const Split = ollama.split("_");
            realLLM = Split[0];
            ollama = `${Split[0]}:${Split.slice(1).join("_")}`;
        } else {
            realLLM = ollama;
        }

        if (!(realLLM in MODELS)) {
            throw new LLMNotSupportedError(LLM);
        }

        return {
            ...MODELS[realLLM as LLMName],
            name: LLM,
            model: (temperature) =>
                new ChatOllama({
                    temperature,
                    model: ollama,
                    streaming: false,
                    baseUrl: process.env.OLLAMA_URL ?? "http://127.0.0.1:11434",
                }),
        };
    }

    if (LLM.endsWith("_0")) {
        LLM = LLM.substring(0, LLM.length - 2);
    }
    if (LLM.indexOf("_")) {
        realLLM = LLM.split("_")[0];
    }

    if (!(realLLM in MODELS)) {
        throw new LLMNotSupportedError(LLM);
    }

    const config = MODELS[realLLM as LLMName];
    if (!("model" in config)) {
        // No default online model
        throw new LLMNotSupportedError(LLM, true);
    }
    return {
        ...config,
        name: LLM,
    };
};

/**
 * Execute a task with multiple LLMs sequentially.
 * Each LLM gets its own session with token tracking.
 *
 * @param task - Async function to execute with each LLM session
 * @param LLMs - Array of LLM models to use
 */
export const useLLMs = async (task: (session: LLMSession) => Promise<void>, LLMs: LLMModel[]) => {
    await logger.withDefaultSource("useLLMs", async () => {
        for (const llm of LLMs) {
            logger.debug(`Initializing LLM ${typeof llm === "string" ? llm : llm.name}`);
            const session: LLMSession = {
                llm: typeof llm === "string" ? initLLM(llm) : llm,
                inputTokens: 0,
                outputTokens: 0,
                expectedItems: 0,
                finishedItems: 0,
            };
            logger.debug("Executing task");
            await task(session);
            logger.info(
                `LLM ${typeof llm === "string" ? llm : llm.name} completed (input tokens: ${session.inputTokens}, output tokens: ${session.outputTokens}, finish rate: ${Math.round(
                    (session.finishedItems / Math.max(1, session.expectedItems)) * 100,
                )}%)`,
            );
        }
    });
};

/**
 * Send a request to the LLM with caching support.
 * Checks cache first, falls back to API call if not found.
 *
 * @param messages - Array of chat messages to send
 * @param cache - Cache folder name for storing responses
 * @param temperature - LLM temperature setting (0-2)
 * @param fakeRequest - If true, simulate without calling LLM
 * @returns The LLM's response text
 */
export const requestLLM = (
    messages: BaseMessage[],
    cache: string,
    temperature?: number,
    fakeRequest = false,
) =>
    logger.withDefaultSource("requestLLM", async () => {
        const { session } = BaseStep.Context.get();
        if (!session) {
            throw new BaseStep.ContextVarNotFoundError("session");
        }

        const input = messages
            .map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)))
            .join("\n~~~\n");

        logger.debug(
            `[${session.llm.name}] LLM request with temperature ${temperature ?? 0}: \n${messages.map((m) => `${m.getType()}: ${m.content as string}`).join("\n---\n")}`,
        );
        const cacheFolder = ensureFolder(`known/${cache}/${session.llm.name}`);
        // Check if the cache exists
        const cacheFile = `${cacheFolder}/${md5(input)}-${temperature}.txt`;
        logger.debug(`[${session.llm.name}] Cache file path: ${cacheFile}`);
        if (existsSync(cacheFile)) {
            logger.debug(`[${session.llm.name}] Cache file exists`);
            const cache = readFileSync(cacheFile, "utf-8");
            const split = cache.split("\n===\n");
            if (split.length === 2) {
                const content = split[1].trim();
                if (content.length > 0) {
                    const inputTokens = tokenize(input).length,
                        outputTokens = tokenize(content).length;
                    session.inputTokens += inputTokens;
                    session.outputTokens += outputTokens;
                    logger.info(
                        `[${session.llm.name}] Cache hit (input tokens: ${inputTokens}, output tokens: ${outputTokens})`,
                    );
                    logger.debug(`[${session.llm.name}] Cache content: ${content}`);
                    // Strip the <think> tags
                    const stripped = stripThinkTags(content);
                    if (stripped.includes("<think>")) {
                        throw new Error("The return content has unclosed <think> tags!");
                    }
                    return stripped;
                }
            }
        }
        // If not, call the model
        logger.info(`[${session.llm.name}] Cache miss`);
        const result = await requestLLMWithoutCache(messages, temperature, fakeRequest);
        logger.debug(`[${session.llm.name}] Writing to cache file`);
        writeFileSync(cacheFile, `${input}\n===\n${result}`);
        // Strip the <think> tags
        const stripped = stripThinkTags(result);
        if (stripped.includes("<think>")) {
            throw new Error("The return content has unclosed <think> tags!");
        }
        return stripped;
    });

/**
 * Call the LLM API directly without using cache
 *
 * This function makes a direct API call to the configured LLM model, bypassing the caching layer.
 * It tracks tokens, handles timeouts, and converts all messages to HumanMessage if the model
 * doesn't support system messages.
 *
 * @param messages - Array of chat messages to send to the model
 * @param temperature - Sampling temperature (0 = deterministic, higher = more random)
 * @param fakeRequest - If true, skip API call and return empty string (for testing)
 * @returns The raw model response text (before stripping <think> tags)
 * @throws {BaseStep.ContextVarNotFoundError} If called outside an LLM session context
 *
 * @internal This function is called by requestLLM() when cache misses occur
 */
export const requestLLMWithoutCache = (
    messages: BaseMessage[],
    temperature?: number,
    fakeRequest = false,
) =>
    logger.withDefaultSource("requestLLMWithoutCache", async () => {
        const { session } = BaseStep.Context.get();
        if (!session) {
            throw new BaseStep.ContextVarNotFoundError("session");
        }

        let text = "";

        const { llm } = session;
        logger.debug(
            `[${llm.name}] LLM request with temperature ${temperature ?? 0}: \n${messages.map((m) => `${m.getType()}: ${m.content as string}`).join("\n---\n")}`,
        );
        if (!llm.systemMessage) {
            messages = messages.map((m) => new HumanMessage(m.content as string));
        }
        if (!fakeRequest) {
            await promiseWithTimeout(
                llm
                    .model(temperature ?? 0)
                    .invoke(messages, { temperature: temperature ?? 0 } as BaseChatModelCallOptions)
                    .then((res) => {
                        text = res.content as string;
                    }),
                llm.local ? 3600000 : 300000,
            );
        }
        const input = messages
            .map((m) => tokenize(m.content as string).length)
            .reduce((acc, cur) => acc + cur);
        const output = tokenize(text).length;
        session.inputTokens += input;
        session.outputTokens += output;

        logger.info(
            `[${llm.name}] LLM request completed (input tokens: ${input}, output tokens: ${output})`,
        );
        logger.debug(`[${llm.name}] LLM response: ${text}`);
        return text;
    });

/**
 * Strip <think> reasoning tags from model output
 *
 * Some reasoning models (like o1) use <think></think> tags to show their internal reasoning process.
 * This function removes those tags and their contents from the final output, keeping only the answer.
 *
 * @param text - Raw model output potentially containing <think> tags
 * @returns Cleaned text with all <think>...</think> sections removed
 *
 * @example
 * stripThinkTags("<think>Let me analyze...</think>The answer is 42")
 * // Returns: "The answer is 42"
 */
const stripThinkTags = (text: string): string => {
    // Remove everything between <think> and </think> tags using regex with dotall flag
    return text.replace(/<think>.*?<\/think>/gs, "").trim();
};
