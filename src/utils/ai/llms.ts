/**
 * LLM Request Management and Caching
 *
 * This module provides centralized LLM (Large Language Model) request handling with built-in caching,
 * token tracking, and support for multiple model providers (OpenAI, Anthropic, Google, OpenRouter).
 *
 * Key Features:
 * - Automatic response caching based on MD5 hash of input messages and temperature
 * - Token usage tracking per session for cost monitoring
 * - Configuration-based model management (loaded from config.json)
 * - Support for custom configurations via overrides
 * - Configurable temperature and timeout settings per model
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
 * 4. If cache hit: read file, parse output, update token counts, return response
 * 5. If cache miss: call requestLLMWithoutCache() to invoke model API
 * 6. Write response to cache file, update token counts, return response
 *
 * Token Tracking:
 * - All requests update session.inputTokens and session.outputTokens
 * - Even cached responses are counted to track "virtual" costs
 * - Token counts from Vercel AI SDK usage data
 */

import { existsSync, readFileSync, writeFileSync } from "fs";

import { generateText, type LanguageModel } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import * as dotenv from "dotenv";
import md5 from "md5";

import { BaseStep } from "../../steps/base-step.js";

import { ensureFolder } from "../io/file.js";
import { logger } from "../core/logger.js";
import { promiseWithTimeout } from "../core/misc.js";
import { type ModelConfig, getModelConfig } from "../core/config.js";
import { tokenize } from "./tokenizer.js";

// Re-export for convenience
export type { ModelConfig } from "../core/config.js";

dotenv.config();

/** Type accepting either a model name string or a direct ModelConfig object */
export type LLMModel = string | ModelConfig;

/**
 * Session object tracking LLM usage and progress for a single model across multiple requests
 *
 * @property config - The model configuration being used
 * @property model - The Vercel AI SDK LanguageModel instance
 * @property inputTokens - Cumulative input tokens consumed across all requests
 * @property outputTokens - Cumulative output tokens generated across all requests
 * @property expectedItems - Total number of items expected to be processed
 * @property finishedItems - Number of items successfully processed so far
 */
export interface LLMSession {
    config: ModelConfig;
    model: LanguageModel;
    inputTokens: number;
    outputTokens: number;
    expectedItems: number;
    finishedItems: number;
}

/**
 * Message type for LLM requests
 * Simplified interface compatible with Vercel AI SDK
 */
export interface Message {
    role: "system" | "user" | "assistant";
    content: string;
}

/**
 * Create a Vercel AI SDK LanguageModel instance from a ModelConfig
 *
 * @param config - Model configuration object
 * @returns Configured LanguageModel instance ready for use
 * @throws {Error} If the provider is not supported
 *
 * @example
 * const config = getModelConfig("gpt-4o");
 * const model = getModel(config);
 */
export const getModel = (config: ModelConfig): LanguageModel => {
    switch (config.provider) {
        case "openai":
            return createOpenAI({
                apiKey: process.env.OPENAI_API_KEY,
            })(config.name);

        case "anthropic":
            return createAnthropic({
                apiKey: process.env.ANTHROPIC_API_KEY,
            })(config.name);

        case "google":
            return createGoogleGenerativeAI({
                apiKey: process.env.GOOGLE_API_KEY,
            })(config.name);

        case "openrouter":
            return createOpenRouter({
                apiKey: process.env.OPENROUTER_API_KEY,
            })(config.name);

        case "openai-compatible":
            return createOpenAICompatible({
                baseURL: config.options?.baseURL ?? process.env.OPENAI_COMPATIBLE_URL ?? "",
                apiKey: config.options?.apiKey ?? process.env.OPENAI_COMPATIBLE_API_KEY ?? "",
                name: config.provider,
            }).chatModel(config.name);

        default:
            throw new Error(`Unsupported provider: ${config.provider}`);
    }
};

/**
 * Initialize an LLM configuration by name
 *
 * Loads configuration from config.json and creates a model instance.
 * Supports model aliasing and configuration overrides.
 *
 * @param name - Model name or alias from config.json
 * @param overrides - Optional configuration overrides for runtime customization
 * @returns ModelConfig object
 * @throws {Error} If model name not found in configuration
 *
 * @example
 * // Standard model
 * const config = initLLM("gpt-4o");
 *
 * @example
 * // With overrides
 * const config = initLLM("custom", {
 *   custom: { provider: "openai", name: "gpt-4o", batchSize: 16 }
 * });
 */
export const initLLM = (
    name: string,
    overrides?: Record<string, ModelConfig | string>,
): ModelConfig => {
    return getModelConfig(name, overrides);
};

/**
 * Execute a task with multiple LLMs sequentially.
 * Each LLM gets its own session with token tracking.
 *
 * @param task - Async function to execute with each LLM session
 * @param LLMs - Array of LLM models to use (names or configs)
 * @param overrides - Optional configuration overrides
 */
export const useLLMs = async (
    task: (session: LLMSession) => Promise<void>,
    LLMs: LLMModel[],
    overrides?: Record<string, ModelConfig | string>,
) => {
    await logger.withDefaultSource("useLLMs", async () => {
        for (const llm of LLMs) {
            const config = typeof llm === "string" ? initLLM(llm, overrides) : llm;
            const modelName = typeof llm === "string" ? llm : llm.name;

            logger.debug(`Initializing LLM ${modelName}`);
            const session: LLMSession = {
                config,
                model: getModel(config),
                inputTokens: 0,
                outputTokens: 0,
                expectedItems: 0,
                finishedItems: 0,
            };
            logger.debug("Executing task");
            await task(session);
            logger.info(
                `LLM ${modelName} completed (input tokens: ${session.inputTokens}, output tokens: ${session.outputTokens}, finish rate: ${Math.round(
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
 * @param messages - Array of chat messages to send (Vercel AI SDK format)
 * @param cache - Cache folder name for storing responses
 * @param temperature - LLM temperature setting (0-2)
 * @param fakeRequest - If true, simulate without calling LLM
 * @returns The LLM's response text
 */
export const requestLLM = (
    messages: Message[],
    cache: string,
    temperature?: number,
    fakeRequest = false,
) =>
    logger.withDefaultSource("requestLLM", async () => {
        const { session } = BaseStep.Context.get();
        if (!session) {
            throw new BaseStep.ContextVarNotFoundError("session");
        }

        const input = messages.map((m) => m.content).join("\n~~~\n");

        logger.debug(
            `[${session.config.name}] LLM request with temperature ${temperature ?? 0}: \n${messages.map((m) => `${m.role}: ${m.content}`).join("\n---\n")}`,
        );
        const cacheFolder = ensureFolder(`known/${cache}/${session.config.name}`);
        // Check if the cache exists
        const cacheFile = `${cacheFolder}/${md5(input)}-${temperature}.txt`;
        logger.debug(`[${session.config.name}] Cache file path: ${cacheFile}`);
        if (existsSync(cacheFile)) {
            logger.debug(`[${session.config.name}] Cache file exists`);
            const cacheContent = readFileSync(cacheFile, "utf-8");
            const split = cacheContent.split("\n===\n");
            if (split.length === 2) {
                const content = split[1].trim();
                if (content.length > 0) {
                    // Use tokenize for consistency with old behavior
                    const inputTokens = tokenize(input).length;
                    const outputTokens = tokenize(content).length;
                    session.inputTokens += inputTokens;
                    session.outputTokens += outputTokens;
                    logger.info(
                        `[${session.config.name}] Cache hit (input tokens: ${inputTokens}, output tokens: ${outputTokens})`,
                    );
                    logger.debug(`[${session.config.name}] Cache content: ${content}`);
                    return content;
                }
            }
        }
        // If not, call the model
        logger.info(`[${session.config.name}] Cache miss`);
        const result = await requestLLMWithoutCache(messages, temperature, fakeRequest);
        logger.debug(`[${session.config.name}] Writing to cache file`);
        writeFileSync(cacheFile, `${input}\n===\n${result}`);
        return result;
    });

/**
 * Call the LLM API directly without using cache
 *
 * This function makes a direct API call to the configured LLM model, bypassing the caching layer.
 * It tracks tokens and handles timeouts.
 *
 * @param messages - Array of chat messages to send to the model (Vercel AI SDK format)
 * @param temperature - Sampling temperature (0 = deterministic, higher = more random)
 * @param fakeRequest - If true, skip API call and return empty string (for testing)
 * @returns The raw model response text
 * @throws {BaseStep.ContextVarNotFoundError} If called outside an LLM session context
 *
 * @internal This function is called by requestLLM() when cache misses occur
 */
export const requestLLMWithoutCache = (
    messages: Message[],
    temperature?: number,
    fakeRequest = false,
) =>
    logger.withDefaultSource("requestLLMWithoutCache", async () => {
        const { session } = BaseStep.Context.get();
        if (!session) {
            throw new BaseStep.ContextVarNotFoundError("session");
        }

        let text = "";

        const { config, model } = session;
        logger.debug(
            `[${config.name}] LLM request with temperature ${temperature ?? 0}: \n${messages.map((m) => `${m.role}: ${m.content}`).join("\n---\n")}`,
        );

        if (!fakeRequest) {
            await promiseWithTimeout(
                (async () => {
                    const result = await generateText({
                        model: model as LanguageModel,
                        messages: messages,
                        temperature: temperature ?? 0,
                    });
                    text = result.text;
                    // Update token counts from actual usage
                    session.inputTokens += result.usage.inputTokens ?? 0;
                    session.outputTokens += result.usage.outputTokens ?? 0;
                })(),
                300000, // 5 minute timeout for API models
            );
        }

        logger.info(
            `[${config.name}] LLM request completed (input tokens: ${session.inputTokens}, output tokens: ${session.outputTokens})`,
        );
        logger.debug(`[${config.name}] LLM response: ${text}`);
        return text;
    });
