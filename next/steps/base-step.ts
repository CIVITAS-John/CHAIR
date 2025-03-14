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

abstract class StepError extends Error {
    constructor(source: string, message: string) {
        super(`${source}: ${message}`);
        this.name = "BaseStep.Error";
    }
}

export abstract class BaseStep {
    abstract _type: string;

    _id = "";
    protected _idStr(mtd?: string) {
        return `${this._id ? `${this._id} ` : ""}${this._type}Step${mtd ? `#${mtd}` : ""}`;
    }

    static Error = StepError;
    static InternalError = class extends BaseStep.Error {};

    static UnexecutedError = class extends BaseStep.Error {
        constructor(source: string) {
            super(source, "Step has not been executed yet");
        }
    };

    static ConfigError = class extends BaseStep.Error {};
    static DependencyError = class extends BaseStep.ConfigError {
        constructor(source: string, dependency: BaseStep) {
            super(
                source,
                `Dependency ${dependency._idStr()} has not been executed yet, please check the order of steps in the job config`,
            );
        }
    };

    execute() {
        if (!this._id) {
            throw new BaseStep.InternalError(this._idStr("execute"), "Step ID is not set");
        }
        return Promise.resolve();
    }
}
