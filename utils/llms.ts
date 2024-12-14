import * as File from "fs";
import * as dotenv from "dotenv";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { BaseMessage, HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { ChatOllama } from "@langchain/ollama";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatMistralAI } from "@langchain/mistralai";
import { ChatGroq } from "@langchain/groq";
import { Tokenize } from "./tokenizer.js";
import md5 from "md5";
import chalk from "chalk";

// Model: The chat model to use.
export var Model: (Temperature: number) => BaseChatModel;
// LLMName: The name of the current LLM.
export var LLMName = "";
// MaxInput: The maximum input tokens for each request.
export var MaxInput: number = 16000;
// MaxOutput: The maximum output tokens for each request.
export var MaxOutput: number = 16000;
// MaxItems: The maximum input items for each request.
// Unfortunately, weaker LLMs like GPT-3.5 turbo sometimes cannot remember all bundled tasks.
export var MaxItems: number = 64;
// InputTokens: The total input tokens for requests so far.
export var InputTokens: number = 0;
// OutputTokens: The total output tokens for requests so far.
export var OutputTokens: number = 0;
// ExpectedItems: The total expected items for requests so far.
export var ExpectedItems: number = 0;
// FinishedItems: The total finished items for requests so far.
export var FinishedItems: number = 0;
// SystemMessage: Whether the model supports system messages.
export var SystemMessage: boolean = true;
/** CountItems: Count the expected and finished items. */
export function CountItems(Expected: number, Finished: number) {
    ExpectedItems += Expected;
    FinishedItems += Finished;
}

/** InitializeLLM: Initialize a LLM with the given name. */
export function InitializeLLM(LLM: string) {
    dotenv.config();
    InputTokens = 0;
    OutputTokens = 0;
    ExpectedItems = 0;
    FinishedItems = 0;
    // Handle the multiple experiments
    if (LLM.endsWith("_0")) LLM = LLM.substring(0, LLM.length - 2);
    var RealLLM = LLM;
    if (LLM.indexOf("_")) RealLLM = LLM.split("_")[0];
    // ollama Support
    var LocalModel = false;
    if (LLM.startsWith("o:")) {
        var Ollama = LLM.substring(2);
        Model = (Temp) =>
            new ChatOllama({
                temperature: Temp,
                model: Ollama,
                streaming: false,
                baseUrl: process.env.OLLAMA_URL
            });
        LocalModel = true;
        RealLLM = Ollama;
        if (RealLLM.indexOf(":") != -1)
            RealLLM = Ollama.split(":")[0];
    }
    // Initialize the LLM
    switch (RealLLM) {
        case "gpt-3.5-turbo":
            // 0.5$ / 1.5$
            MaxInput = 16385;
            MaxOutput = 4096;
            MaxItems = 32;
            if (!LocalModel) Model = (Temp) =>
                new ChatOpenAI({
                    temperature: Temp,
                    modelName: "gpt-3.5-turbo-0125",
                    streaming: false,
                    maxTokens: MaxOutput,
                });
            break;
        case "gpt-4.5-turbo":
            // 10$ / 30$
            MaxInput = 16385;
            MaxOutput = 4096;
            MaxItems = 64;
            if (!LocalModel) Model = (Temp) =>
                new ChatOpenAI({
                    temperature: Temp,
                    modelName: "gpt-4-turbo",
                    streaming: false,
                    maxTokens: MaxOutput,
                });
            break;
        case "gpt-4.5-omni":
            // 2.5$ / 10$
            MaxInput = 16385;
            MaxOutput = 4096;
            MaxItems = 64;
            if (!LocalModel) Model = (Temp) =>
                new ChatOpenAI({
                    temperature: Temp,
                    modelName: "gpt-4o",
                    streaming: false,
                    maxTokens: MaxOutput,
                });
            break;
        case "gpt-4.5-mini":
            // 0.15$ / 0.6$
            MaxInput = 16385;
            MaxOutput = 4096;
            MaxItems = 64;
            if (!LocalModel) Model = (Temp) =>
                new ChatOpenAI({
                    temperature: Temp,
                    modelName: "gpt-4o-mini",
                    streaming: false,
                    maxTokens: MaxOutput,
                });
            break;
        case "gpt-4.5-audio":
            // 2.5$ / 10$
            // 100$ / 200$ audio
            MaxInput = 16385;
            MaxOutput = 4096;
            MaxItems = 64;
            if (!LocalModel) Model = (Temp) =>
                new ChatOpenAI({
                    temperature: Temp,
                    modelName: "gpt-4o-audio-preview",
                    streaming: false,
                    maxTokens: MaxOutput,
                });
            break;
        case "o1-mini":
            // 3$ / 12$
            MaxInput = 16385;
            MaxOutput = 4096;
            MaxItems = 64;
            SystemMessage = false;
            if (!LocalModel) Model = (Temp) =>
                new ChatOpenAI({
                    // Does not support temperature
                    modelName: "o1-mini",
                    streaming: false,
                    // maxCompletionTokens: MaxOutput,
                    // need to update the package, it seems
                });
            break;
        case "o1-preview":
            // 15$ / 60$
            MaxInput = 16385;
            MaxOutput = 4096;
            MaxItems = 64;
            SystemMessage = false;
            if (!LocalModel) Model = (Temp) =>
                new ChatOpenAI({
                    // Does not support temperature
                    modelName: "o1-mini",
                    streaming: false,
                    // maxCompletionTokens: MaxOutput,
                    // need to update the package, it seems
                });
            break;
        case "claude3-haiku":
            // 0.25$ / 0.75$
            MaxInput = 200000;
            MaxOutput = 4096;
            MaxItems = 32;
            if (!LocalModel) Model = (Temp) =>
                new ChatAnthropic({
                    temperature: Temp,
                    modelName: "claude-3-haiku-20240307",
                    streaming: false,
                    maxTokens: MaxOutput,
                });
            break;
        case "claude3-sonnet":
            // 3$ / 15$
            MaxInput = 200000;
            MaxOutput = 4096;
            MaxItems = 64;
            if (!LocalModel) Model = (Temp) =>
                new ChatAnthropic({
                    temperature: Temp,
                    modelName: "claude-3-sonnet-20240229",
                    streaming: false,
                    maxTokens: MaxOutput,
                });
            break;
        case "claude3.5-sonnet":
            // 3$ / 15$
            MaxInput = 200000;
            MaxOutput = 4096;
            MaxItems = 64;
            if (!LocalModel) Model = (Temp) =>
                new ChatAnthropic({
                    temperature: Temp,
                    modelName: "claude-3-5-sonnet-20240620",
                    streaming: false,
                    maxTokens: MaxOutput,
                });
            break;
        case "mixtral-8x22b":
            // 2$ / 6$
            MaxInput = 32000;
            MaxOutput = 32000;
            MaxItems = 32;
            if (!LocalModel) Model = (Temp) =>
                new ChatMistralAI({
                    temperature: 1,
                    modelName: "open-mixtral-8x22b",
                    streaming: false,
                    maxTokens: MaxOutput,
                });
            break;
        case "llama3-70b":
            // 0.59$ / 0.79$
            MaxInput = 8192;
            MaxOutput = 8192;
            MaxItems = 32;
            if (!LocalModel) Model = (Temp) =>
                new ChatGroq({
                    temperature: Temp,
                    modelName: "llama3-70b-8192",
                    streaming: false,
                    maxTokens: MaxOutput,
                });
            break;
        case "gemma2":
            // Assuming 27b; models <= 10b generally don't really work
            MaxInput = 64000;
            MaxOutput = 64000;
            MaxItems = 32;
            if (!LocalModel) throw new Error(`LLM ${LLM} is local only through ollama.`);
            break;
        case "mistral-small":
            MaxInput = 64000;
            MaxOutput = 64000;
            MaxItems = 32;
            if (!LocalModel) throw new Error(`LLM ${LLM} is local only through ollama.`);
            break;
        case "mistral-nemo":
            // It claims to support 128k, but I don't think it would work well with that large window.
            MaxInput = 8192;
            MaxOutput = 8192;
            MaxItems = 8;
            if (!LocalModel) throw new Error(`LLM ${LLM} is local only through ollama.`);
            break;
        default:
            throw new Error(`LLM ${LLM} not supported.`);
    }
    LLMName = LLM;
}

/** UseLLM: Use a specific LLM. Call it before start translating. */
export function UseLLM(LLM: string): void {
    InitializeLLM(LLM);
}

/** UseLLMs: Use specific LLMs one by one. Call it before start translating. */
export async function UseLLMs(Task: () => Promise<void>, ...LLMs: string[]): Promise<void> {
    for (const LLM of LLMs) {
        UseLLM(LLM);
        await Task();
        console.log(
            `LLM ${LLM} done. Input tokens: ${InputTokens}, Output tokens: ${OutputTokens}. Finish rate: ${Math.round(
                (FinishedItems / Math.max(1, ExpectedItems)) * 100,
            )}%.\n`,
        );
    }
}

/** RequestLLMWithCache: Call the model to generate text with cache. */
export async function RequestLLMWithCache(
    Messages: BaseMessage[],
    Cache: string,
    Temperature?: number,
    FakeRequest: boolean = false,
): Promise<string> {
    var Input = Messages.map((Message) => Message.content).join("\n~~~\n");
    var CacheFolder = EnsureFolder(`known/${Cache}/${LLMName}`);
    // Check if the cache exists
    var CacheFile = `${CacheFolder}/${md5(Input)}-${Temperature}.txt`;
    if (File.existsSync(CacheFile)) {
        var Cache = File.readFileSync(CacheFile, "utf-8");
        var Split = Cache.split("\n===\n");
        if (Split.length == 2) {
            var Content = Split[1].trim();
            if (Content.length > 0) {
                InputTokens += Tokenize(Input).length;
                OutputTokens += Tokenize(Content).length;
                return Content;
            }
        }
    }
    // If not, call the model
    var Result = await RequestLLM(Messages, Temperature, FakeRequest);
    File.writeFileSync(CacheFile, `${Input}\n===\n${Result}`);
    return Result;
}

/** RequestLLM: Call the model to generate text. */
export async function RequestLLM(Messages: BaseMessage[], Temperature?: number, FakeRequest: boolean = false): Promise<string> {
    var Text = "";
    try {
        console.log(
            chalk.dim(
                `LLM Request ${Temperature ?? 0}: \n${Messages.map((Message) => `${Message._getType()}: ${Message.content}`).join("\n---\n")}\n`,
            ),
        );
        if (!SystemMessage)
            Messages = Messages.map(Message => new HumanMessage(Message.content as string));
        if (!FakeRequest) {
            await PromiseWithTimeout(
                Model(Temperature ?? 0)
                    .invoke(Messages, { temperature: Temperature } as any)
                    .then((Result) => {
                        Text = Result.content as string;
                    }),
                LLMName.startsWith("o:") ? 3000000 : 300000,
            );
            console.log(chalk.cyan(`LLM Result: \n${Text}`));
        }
        var Input = Messages.map((Message) => Tokenize(Message.content as string).length).reduce((Prev, Curr) => Prev + Curr);
        var Output = Tokenize(Text).length;
        InputTokens += Input;
        OutputTokens += Output;
        console.log(chalk.gray(`LLM Tokens: Input ${Input}, Output ${Output}\n`));
    } catch (Error: any) {
        console.log(Error);
        throw Error;
    }
    return Text;
}

/** PromiseWithTimeout: Create a promise with timeout. */
export function PromiseWithTimeout<T>(promise: Promise<T>, time: number, timeoutError = new Error("Sorry, the AI stopped responding.")): Promise<T> {
    // create a promise that rejects in milliseconds
    const timeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(timeoutError), time);
    });
    // returns a race between timeout and the passed promise
    return Promise.race<T>([promise, timeout]);
}

/** EnsureFolder: Ensure that a folder exists. */
export function EnsureFolder(Folder: string) {
    Folder = Folder.replaceAll(":", "_");
    if (!File.existsSync(Folder)) File.mkdirSync(Folder, { recursive: true });
    return Folder;
}
