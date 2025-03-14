import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

export type LLMName =
    | "gpt-4.5-omni"
    | "o_gemma2_27b-instruct-q5_K_M"
    | "o_mistral-small_22b-instruct-2409-q5_K_M"
    | "o_mistral-nemo_12b-instruct-2407-q8_0"
    | "o_qwen2.5_14b-instruct-q8_0"
    // ...
    | (string & {}); // To allow for custom models without breaking autocomplete

export type CodeStrategy =
    | "low-level-1"
    | "low-level-2"
    | "low-level-3"
    | "low-level-4"
    | "low-level-5"
    // ...
    | (string & {});

export type ConsolidateStrategy =
    | "alternative-merger"
    | "category-assigner"
    // ...
    | (string & {});

export interface LLMConfig {
    Model: (Temperature: number) => BaseChatModel;
    LLMName: string;
    MaxInput?: number;
    MaxOutput?: number;
    MaxItems?: number;
    SystemMessage?: boolean;
}

export type LLMModel = LLMName | LLMConfig;

export interface AIParameters extends Record<string, unknown> {
    Retries?: number;
    Temperature?: number;
    CustomPrompt?: string;
}

export abstract class BaseStep {
    abstract _type: string;

    _id = "";
    protected _source(mtd?: string) {
        return `${this._id ? `${this._id} ` : ""}${this._type}Step${mtd ? `#${mtd}` : ""}`;
    }

    static Error = class extends Error {
        constructor(source: string, message: string) {
            super(`${source}: ${message}`);
        }
    };

    static UnexecutedError = class extends BaseStep.Error {
        constructor(source: string) {
            super(source, "Step has not been executed yet");
        }
    };

    abstract execute(): Promise<void>;
}
