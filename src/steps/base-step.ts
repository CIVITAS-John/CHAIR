import { AsyncVar } from "@rakuzen25/async-store";

import type { Dataset } from "../schema.js";
import type { EmbedderObject } from "../utils/embeddings.js";
import type { LLMSession } from "../utils/llms.js";
import { logger } from "../utils/logger.js";

export interface AIParameters extends Record<string, unknown> {
    retries?: number;
    temperature?: number;
    customPrompt?: string;
    fakeRequest?: boolean;
}

interface IStepContext {
    dataset: Dataset<unknown>;
    session?: LLMSession;
    embedder?: EmbedderObject;
}
export const StepContext = new AsyncVar<IStepContext>("StepContext");
export class ContextVarNotFoundError extends Error {
    override name = "ContextVarNotFoundError";
    constructor(name: keyof IStepContext) {
        super(`${name} not provided in StepContext`);
    }
}

abstract class StepError extends Error {
    override name = "BaseStep.Error";
    constructor(message: string, source?: string) {
        super(`${source ?? logger.source}: ${message}`);
    }
}

export abstract class BaseStep {
    abstract dependsOn?: BaseStep[];
    executed = false;
    aborted = false;

    _id = "";
    protected get _prefix() {
        return `${this._id ? `${this._id} ` : ""}${this.constructor.name}`;
    }

    static Error = StepError;
    static InternalError = class extends BaseStep.Error {
        override name = "BaseStep.InternalError";
    };

    static UnexecutedError = class extends BaseStep.Error {
        override name = "BaseStep.UnexecutedError";
        constructor(source?: string) {
            super("Step has not been executed yet", source);
        }
    };
    static AbortedError = class extends BaseStep.Error {
        override name = "BaseStep.AbortedError";
        constructor(source?: string) {
            super("Step has been aborted", source);
        }
    };

    static ConfigError = class extends BaseStep.Error {
        override name = "BaseStep.ConfigError";
    };

    execute() {
        logger.withSource(this._prefix, "execute", () => {
            if (!this._id) {
                throw new BaseStep.InternalError("Step ID is not set");
            }
            if (this.executed) {
                throw new BaseStep.ConfigError(
                    "Step has already been executed, please check job configuration",
                );
            }
            if (this.aborted) {
                throw new BaseStep.AbortedError();
            }
            if (this.dependsOn) {
                for (const step of this.dependsOn) {
                    if (step.aborted) {
                        this.abort(step);
                        throw new BaseStep.AbortedError();
                    }
                    if (!step.executed) {
                        throw new BaseStep.UnexecutedError();
                    }
                }
            }
        });

        return Promise.resolve();
    }

    abort(dep?: BaseStep) {
        logger.withSource(this._prefix, "abort", () => {
            logger.warn(`Aborting${dep ? `: dependency ${dep._id} aborted` : ""}`);
            this.aborted = true;
        });
    }
}
