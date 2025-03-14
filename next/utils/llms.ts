import { existsSync, readFileSync, writeFileSync } from "fs";

import { ChatAnthropic } from "@langchain/anthropic";
import type {
    BaseChatModel,
    BaseChatModelCallOptions,
} from "@langchain/core/language_models/chat_models";
import type { BaseMessage } from "@langchain/core/messages";
import { HumanMessage } from "@langchain/core/messages";
import { ChatGroq } from "@langchain/groq";
import { ChatMistralAI } from "@langchain/mistralai";
import { ChatOllama } from "@langchain/ollama";
import { ChatOpenAI } from "@langchain/openai";
import * as dotenv from "dotenv";
import md5 from "md5";

import type { IDStrFunc } from "../steps/base-step.js";

import { logger } from "./logger.js";
import { ensureFolder, promiseWithTimeout } from "./misc.js";
import { tokenize } from "./tokenizer.js";

const MODELS = {
    "gpt-3.5-turbo": {
        // 0.5$ / 1.5$
        maxInput: 16385,
        maxOutput: 4096,
        maxItems: 32,
        model: (temperature) =>
            new ChatOpenAI({
                temperature,
                modelName: "gpt-3.5-turbo-0125",
                streaming: false,
                maxTokens: 4096,
            }),
    },
    "gpt-4.5-turbo": {
        // 10$ / 30$
        maxInput: 16385,
        maxOutput: 4096,
        maxItems: 64,
        model: (temperature) =>
            new ChatOpenAI({
                temperature,
                modelName: "gpt-4-turbo",
                streaming: false,
                maxTokens: 4096,
            }),
    },
    "gpt-4.5-omni": {
        // 2.5$ / 10$
        maxInput: 16385,
        maxOutput: 4096,
        maxItems: 64,
        model: (temperature) =>
            new ChatOpenAI({
                temperature,
                modelName: "gpt-4o",
                streaming: false,
                maxTokens: 4096,
            }),
    },
    "gpt-4.5-mini": {
        // 0.15$ / 0.6$
        maxInput: 16385,
        maxOutput: 4096,
        maxItems: 64,
        model: (temperature) =>
            new ChatOpenAI({
                temperature,
                modelName: "gpt-4o-mini",
                streaming: false,
                maxTokens: 4096,
            }),
    },
    "gpt-4.5-audio": {
        // 2.5$ / 10$
        // 100$ / 200$ audio
        maxInput: 16385,
        maxOutput: 4096,
        maxItems: 64,
        model: (temperature) =>
            new ChatOpenAI({
                temperature,
                modelName: "gpt-4o-audio-preview",
                streaming: false,
                maxTokens: 4096,
            }),
    },
    "o3-mini": {
        // 1.1$ / 4.4$
        maxInput: 16385,
        maxOutput: 4096,
        maxItems: 64,
        systemMessage: false,
        model: () =>
            new ChatOpenAI({
                // Does not support temperature
                modelName: "o3-mini",
                streaming: false,
                // maxCompletionTokens: MaxOutput,
                // need to update the package, it seems
            }),
    },
    o1: {
        // 15$ / 60$
        maxInput: 16385,
        maxOutput: 4096,
        maxItems: 64,
        systemMessage: false,
        model: () =>
            new ChatOpenAI({
                // Does not support temperature
                modelName: "o1",
                streaming: false,
                // maxCompletionTokens: MaxOutput,
                // need to update the package, it seems
            }),
    },
    "claude3-haiku": {
        // 0.25$ / 0.75$
        maxInput: 200000,
        maxOutput: 4096,
        maxItems: 32,
        model: (temperature) =>
            new ChatAnthropic({
                temperature,
                modelName: "claude-3-haiku-20240307",
                streaming: false,
                maxTokens: 4096,
            }),
    },
    "claude3-sonnet": {
        // 3$ / 15$
        maxInput: 200000,
        maxOutput: 4096,
        maxItems: 64,
        model: (temperature) =>
            new ChatAnthropic({
                temperature,
                modelName: "claude-3-sonnet-20240229",
                streaming: false,
                maxTokens: 4096,
            }),
    },
    "claude3.5-sonnet": {
        // 3$ / 15$
        maxInput: 200000,
        maxOutput: 4096,
        maxItems: 64,
        model: (temperature) =>
            new ChatAnthropic({
                temperature,
                modelName: "claude-3-5-sonnet-20240620",
                streaming: false,
                maxTokens: 4096,
            }),
    },
    "mixtral-8x22b": {
        // 2$ / 6$
        maxInput: 32000,
        maxOutput: 32000,
        maxItems: 32,
        model: () =>
            new ChatMistralAI({
                temperature: 1,
                modelName: "open-mixtral-8x22b",
                streaming: false,
                maxTokens: 32000,
            }),
    },
    "llama3-70b": {
        // 0.59$ / 0.79$
        maxInput: 8192,
        maxOutput: 8192,
        maxItems: 32,
        model: (temperature) =>
            new ChatGroq({
                temperature,
                modelName: "llama3-70b-8192",
                streaming: false,
                maxTokens: 8192,
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
                modelName: "llama-3.3-70b-versatile",
                streaming: false,
                maxTokens: 8192,
            }),
    },
    gemma2: {
        // Assuming 27b; models <= 10b generally don't really work
        maxInput: 64000,
        maxOutput: 64000,
        maxItems: 32,
    },
    "mistral-small": {
        // Assuming 22b
        maxInput: 64000,
        maxOutput: 64000,
        maxItems: 32,
    },
    "qwen2.5": {
        // Assuming 14b (32b takes a bit too much vrams)
        maxInput: 8192,
        maxOutput: 8192,
        maxItems: 16,
    },
    "mistral-nemo": {
        // It claims to support 128k, but I don't think it would work well with that large window.
        maxInput: 8192,
        maxOutput: 8192,
        maxItems: 16,
    },
} satisfies Record<string, Omit<LLMObject, "name" | "model"> & Partial<Pick<LLMObject, "model">>>;

export type LLMName = keyof typeof MODELS;

export interface LLMObject {
    model: (temperature: number) => BaseChatModel;
    name: string;
    maxInput: number;
    maxOutput: number;
    maxItems: number;
    systemMessage?: boolean;
}

export type LLMModel = LLMName | LLMObject;

export interface LLMSession {
    llm: LLMObject;
    inputTokens: number;
    outputTokens: number;
    expectedItems: number;
    finishedItems: number;
}

dotenv.config();

/** Initialize a LLM with the given name. */
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
            throw new Error(`LLM ${realLLM} not supported.`);
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
        throw new Error(`LLM ${LLM} not supported`);
    }

    const config = MODELS[realLLM as LLMName];
    if (!("model" in config)) {
        // No default online model
        throw new Error(`LLM ${LLM} is local only through ollama`);
    }
    return {
        ...config,
        name: LLM,
    };
};

/** UseLLMs: Use specific LLMs one by one. Call it before start translating. */
export const useLLMs = async (
    idStr: IDStrFunc,
    task: (session: LLMSession) => Promise<void>,
    LLMs: LLMModel[],
) => {
    for (const llm of LLMs) {
        logger.debug(
            `Initializing LLM ${typeof llm === "string" ? llm : llm.name}`,
            idStr("useLLMs"),
        );
        const session: LLMSession = {
            llm: typeof llm === "string" ? initLLM(llm) : llm,
            inputTokens: 0,
            outputTokens: 0,
            expectedItems: 0,
            finishedItems: 0,
        };
        logger.debug("Executing task", idStr("useLLMs"));
        await task(session);
        logger.info(
            `LLM ${typeof llm === "string" ? llm : llm.name} completed (input tokens: ${session.inputTokens}, output tokens: ${session.outputTokens}, finish rate: ${Math.round(
                (session.finishedItems / Math.max(1, session.expectedItems)) * 100,
            )}%)`,
            idStr("useLLMs"),
        );
    }
};

/** Call the model to generate text with cache. */
export const requestLLM = async (
    idStr: IDStrFunc,
    session: LLMSession,
    messages: BaseMessage[],
    cache: string,
    temperature?: number,
    fakeRequest = false,
) => {
    const _id = idStr("requestLLM");

    const input = messages.map((m) => m.content).join("\n~~~\n");

    logger.debug(
        `[${session.llm.name}] LLM request with temperature ${temperature ?? 0}: \n${messages.map((m) => `${m.getType()}: ${m.content as string}`).join("\n---\n")}`,
        _id,
    );
    const cacheFolder = ensureFolder(`known/${cache}/${session.llm.name}`);
    // Check if the cache exists
    const cacheFile = `${cacheFolder}/${md5(input)}-${temperature}.txt`;
    logger.debug(`[${session.llm.name}] Cache file path: ${cacheFile}`, _id);
    if (existsSync(cacheFile)) {
        logger.debug(`[${session.llm.name}] Cache file exists`, _id);
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
                    _id,
                );
                logger.debug(`[${session.llm.name}] Cache content: ${content}`, _id);
                return content;
            }
        }
    }
    // If not, call the model
    logger.info(`[${session.llm.name}] Cache miss`, _id);
    const result = await requestLLMWithoutCache(idStr, session, messages, temperature, fakeRequest);
    logger.debug(`[${session.llm.name}] Writing to cache file`, _id);
    writeFileSync(cacheFile, `${input}\n===\n${result}`);
    return result;
};

/** Call the model to generate text, explicitly bypassing cache. */
export const requestLLMWithoutCache = async (
    idStr: IDStrFunc,
    session: LLMSession,
    messages: BaseMessage[],
    temperature?: number,
    fakeRequest = false,
) => {
    const _id = idStr("requestLLMWithoutCache");
    let text = "";

    const { llm } = session;
    logger.debug(
        `[${llm.name}] LLM request with temperature ${temperature ?? 0}: \n${messages.map((m) => `${m.getType()}: ${m.content as string}`).join("\n---\n")}`,
        _id,
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
            llm.name.startsWith("o_") ? 3600000 : 300000,
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
        _id,
    );
    logger.debug(`[${llm.name}] LLM response: ${text}`, _id);
    return text;
};
