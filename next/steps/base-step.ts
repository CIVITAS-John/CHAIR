export type ConsolidateStrategy =
    | "alternative-merger"
    | "category-assigner"
    // ...
    | (string & {});

export interface AIParameters extends Record<string, unknown> {
    retries?: number;
    temperature?: number;
    customPrompt?: string;
    fakeRequest?: boolean;
}

abstract class StepError extends Error {
    constructor(message: string, source: string) {
        super(`${source}: ${message}`);
        this.name = "BaseStep.Error";
    }
}

export type IDStrFunc = (mtd?: string) => string;

export abstract class BaseStep {
    abstract _type: string;

    _id = "";
    protected _idStr: IDStrFunc = (mtd?: string) =>
        `${this._id ? `${this._id} ` : ""}${this._type}Step${mtd ? `#${mtd}` : ""}`;

    static Error = StepError;
    static InternalError = class extends BaseStep.Error {};

    static UnexecutedError = class extends BaseStep.Error {
        constructor(source: string) {
            super("Step has not been executed yet", source);
        }
    };

    static ConfigError = class extends BaseStep.Error {};

    execute() {
        if (!this._id) {
            throw new BaseStep.InternalError("Step ID is not set", this._idStr("execute"));
        }
        return Promise.resolve();
    }
}
