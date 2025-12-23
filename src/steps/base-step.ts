import { AsyncVar } from "@rakuzen25/async-store";

import type { Dataset } from "../schema.js";
import type { LLMSession } from "../utils/ai/llms.js";
import { logger } from "../utils/core/logger.js";

/**
 * Configuration parameters for AI-powered analysis steps
 */
export interface AIParameters extends Record<string, unknown> {
    /** Number of retry attempts for failed requests */
    retries?: number;
    /** Temperature setting for LLM creativity (0-2) */
    temperature?: number;
    /** Additional custom instructions for the LLM */
    customPrompt?: string;
    /** Whether to simulate requests without calling LLM */
    fakeRequest?: boolean;
}

/**
 * Shared context passed between analysis steps
 */
interface StepContext {
    /** The dataset being analyzed */
    dataset: Dataset<unknown>;
    /** Optional LLM session for AI-powered steps */
    session?: LLMSession;
}

/**
 * Base error class for step-related errors
 */
abstract class StepError extends Error {
    override name = "BaseStep.Error";
    constructor(message: string, source?: string) {
        super(`${source ?? logger.source}: ${message}`);
    }
}

/**
 * Abstract base class for analysis pipeline steps.
 * Steps can depend on other steps and execute in sequence.
 */
export abstract class BaseStep {
    /** Optional array of steps that must execute before this one */
    abstract dependsOn?: BaseStep[];
    /** Whether this step has completed execution */
    executed = false;
    /** Whether this step was aborted due to errors */
    aborted = false;

    /** Internal identifier for logging and tracking */
    _id = "";
    /** Generate prefixed logger name for this step */
    protected get _prefix() {
        return `${this._id ? `${this._id} ` : ""}${this.constructor.name}`;
    }

    // Error classes for different failure scenarios
    static Error = StepError;
    /** Error for internal step failures */
    static InternalError = class extends BaseStep.Error {
        override name = "BaseStep.InternalError";
    };

    /** Error when trying to use results from an unexecuted step */
    static UnexecutedError = class extends BaseStep.Error {
        override name = "BaseStep.UnexecutedError";
        constructor(source?: string) {
            super("Step has not been executed yet", source);
        }
    };
    /** Error when step execution was aborted */
    static AbortedError = class extends BaseStep.Error {
        override name = "BaseStep.AbortedError";
        constructor(source?: string) {
            super("Step has been aborted", source);
        }
    };

    /** Error for configuration issues */
    static ConfigError = class extends BaseStep.Error {
        override name = "BaseStep.ConfigError";
    };

    /** Async context storage for sharing data between steps */
    static Context = new AsyncVar<StepContext>("BaseStep.Context");
    /** Error when required context variable is missing */
    static ContextVarNotFoundError = class extends BaseStep.Error {
        override name = "BaseStep.ContextVarNotFoundError";
        constructor(name: keyof StepContext, source?: string) {
            super(`${name} not provided in BaseStep.Context`, source);
        }
    };

    /**
     * Execute this step, checking dependencies and state first.
     * Ensures steps run in correct order and only once.
     */
    execute() {
        logger.withSource(this._prefix, "execute", () => {
            // Validate step is properly configured
            if (!this._id) {
                throw new BaseStep.InternalError("Step ID is not set");
            }
            // Prevent double execution
            if (this.executed) {
                throw new BaseStep.ConfigError(
                    "Step has already been executed, please check job configuration",
                );
            }
            // Check if step was aborted
            if (this.aborted) {
                throw new BaseStep.AbortedError();
            }
            // Verify all dependencies have executed successfully
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

    /**
     * Mark this step as aborted, optionally due to a dependency failure
     */
    abort(dep?: BaseStep) {
        logger.withSource(this._prefix, "abort", () => {
            logger.warn(`Aborting${dep ? `: dependency ${dep._id} aborted` : ""}`);
            this.aborted = true;
        });
    }
}
