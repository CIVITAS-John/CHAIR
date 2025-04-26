import { logger } from "../utils/logger.js";

export interface AIParameters extends Record<string, unknown> {
    retries?: number;
    temperature?: number;
    customPrompt?: string;
    fakeRequest?: boolean;
}

abstract class StepError extends Error {
    override name = "BaseStep.Error";
    constructor(message: string, source: string) {
        super(`${source}: ${message}`);
    }
}

export type IDStrFunc = (mtd?: string) => string;

export abstract class BaseStep {
    abstract dependsOn?: BaseStep[];
    executed = false;
    aborted = false;

    _id = "";
    protected _idStr: IDStrFunc = (mtd?: string) =>
        `${this._id ? `${this._id} ` : ""}${this.constructor.name}${mtd ? `#${mtd}` : ""}`;

    static Error = StepError;
    static InternalError = class extends BaseStep.Error {
        override name = "BaseStep.InternalError";
    };

    static UnexecutedError = class extends BaseStep.Error {
        override name = "BaseStep.UnexecutedError";
        constructor(source: string) {
            super("Step has not been executed yet", source);
        }
    };
    static AbortedError = class extends BaseStep.Error {
        override name = "BaseStep.AbortedError";
        constructor(source: string) {
            super("Step has been aborted", source);
        }
    };

    static ConfigError = class extends BaseStep.Error {
        override name = "BaseStep.ConfigError";
    };

    execute() {
        const _id = this._idStr("execute");

        if (!this._id) {
            throw new BaseStep.InternalError("Step ID is not set", _id);
        }
        if (this.executed) {
            throw new BaseStep.ConfigError(
                "Step has already been executed, please check job configuration",
                _id,
            );
        }
        if (this.aborted) {
            throw new BaseStep.AbortedError(_id);
        }
        if (this.dependsOn) {
            for (const step of this.dependsOn) {
                if (step.aborted) {
                    this.abort(_id, step);
                    throw new BaseStep.AbortedError(_id);
                }
                if (!step.executed) {
                    throw new BaseStep.UnexecutedError(step._idStr("execute"));
                }
            }
        }

        return Promise.resolve();
    }

    abort(id: string, dep?: BaseStep) {
        logger.warn(`Aborting${dep ? `: dependency ${dep._id} aborted` : ""}`, id);
        this.aborted = true;
    }
}
