import * as File from 'fs';
import * as dotenv from 'dotenv'
import { BaseChatModel } from "@langchain/core/language_models/chat_models"
import { BaseMessage } from "@langchain/core/messages"
import { ChatOpenAI } from "@langchain/openai"
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatMistralAI } from '@langchain/mistralai';
import { Tokenize } from './tokenizer.js';
import md5 from 'md5';

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

/** InitializeLLM: Initialize a LLM with the given name. */
export function InitializeLLM(LLM: string) {
    dotenv.config();
    switch (LLM) {
        case "gpt-3.5-turbo":
            // 0.5$ / 1.5$
            MaxInput = 16385;
            MaxOutput = 4096;
            MaxItems = 32;
            Model = (Temp) => new ChatOpenAI({
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
            MaxItems = 32;
            Model = (Temp) => new ChatOpenAI({
                temperature: Temp,
                modelName: "gpt-4-turbo",
                streaming: false,
                maxTokens: MaxOutput,
            });
            break;
        case "claude3-haiku":
            // 0.25$ / 0.75$
            MaxInput = 200000;
            MaxOutput = 4096;
            MaxItems = 32;
            Model = (Temp) => new ChatAnthropic({
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
            MaxItems = 32;
            Model = (Temp) => new ChatAnthropic({
                temperature: Temp,
                modelName: "claude-3-sonnet-20240229",
                streaming: false,
                maxTokens: MaxOutput,
            });
            break;
        case "mistral-small":
            // The cheaper one, 7x8b, does not work even for translation
            // 2$ / 8$
            MaxInput = 32000;
            MaxOutput = 32000;
            MaxItems = 32;
            Model = (Temp) => new ChatMistralAI({
                temperature: Temp,
                modelName: "mistral-small-latest",
                streaming: false,
                maxTokens: MaxOutput,
            });
            break;
        default:
            throw new Error(`LLM ${LLM} not found.`);
    }
    LLMName = LLM;
}

/** RequestLLMWithCache: Call the model to generate text with cache. */
export async function RequestLLMWithCache(Messages: BaseMessage[], Cache: string, Temperature?: number, FakeRequest: boolean = false): Promise<string> {
    var Input = Messages.map(Message => Message.content).join('\n~~~\n');
    var CacheFolder = `known/${Cache}/${LLMName}`;
    EnsureFolder(CacheFolder);
    // Check if the cache exists
    var CacheFile = `${CacheFolder}/${md5(Input)}-${Temperature}.txt`;
    if (File.existsSync(CacheFile)) {
        var Cache = File.readFileSync(CacheFile, 'utf-8');
        var Split = Cache.split('\n===\n');
        if (Split.length == 2) {
            var Content = Split[1].trim();
            if (Content.length > 0) return Content;
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
        console.log(`LLM Request ${Temperature ?? 0}: \n${Messages.map(Message => `${Message._getType()}: ${Message.content}`).join('\n---\n')}\n`);
        if (!FakeRequest) {
            await PromiseWithTimeout(
                Model(Temperature ?? 0).invoke(Messages, { temperature: Temperature } as any).then(Result => {
                    Text = Result.content as string;
                }), 120000);
            console.log(`LLM Result: \n${Text}\n`);
        }
        console.log(`LLM Tokens: Input ${Messages.map(Message => Tokenize(Message.content as string).length).reduce((Prev, Curr) => Prev + Curr)}, Output ${Tokenize(Text).length}\n`);
    } catch (Error: any) {
        console.log(Error);
        throw Error;
    }
    return Text;
}

/** PromiseWithTimeout: Create a promise with timeout. */
export function PromiseWithTimeout<T>(
    promise: Promise<T>,
    time: number,
    timeoutError = new Error('Sorry, the AI stopped responding.')
): Promise<T> {
    // create a promise that rejects in milliseconds
    const timeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(timeoutError), time)
    })
    // returns a race between timeout and the passed promise
    return Promise.race<T>([promise, timeout])
}

/** EnsureFolder: Ensure that a folder exists. */
export function EnsureFolder(Folder: string) {
    if (!File.existsSync(Folder)) File.mkdirSync(Folder, { recursive: true })
}