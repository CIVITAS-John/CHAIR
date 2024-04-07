import * as File from 'fs';
import * as dotenv from 'dotenv'
import { BaseChatModel } from "@langchain/core/language_models/chat_models"
import { ChatOpenAI } from "@langchain/openai"
import { BaseMessage } from "@langchain/core/messages"

// Model: The chat model to use.
export var Model: BaseChatModel | undefined;
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
            MaxInput = 16385;
            MaxOutput = 3072;
            MaxItems = 32;
            Model = new ChatOpenAI({
                temperature: 0,
                modelName: "gpt-3.5-turbo-0125",
                streaming: false,
                maxTokens: MaxOutput,
            });
            break;
        default:
            throw new Error(`LLM ${LLM} not found.`);
    }
    LLMName = LLM;
}

/** RequestLLM: Call the model to generate text. */
export async function RequestLLM(Messages: BaseMessage[]): Promise<string> {
    var Text = "";
    try {
        console.log(`LLM Request: \n${Messages.map(Message => `${Message._getType()}: ${Message.content}`).join('\n---\n')}\n`);
        await PromiseWithTimeout(
            Model!.invoke(Messages).then(Result => {
                Text = Result.content as string;
            }), 120000);
        console.log(`LLM Result: \n${Text}\n`);
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