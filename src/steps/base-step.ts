/**
 * Base Step Module
 *
 * This module provides the foundation for the analysis pipeline's step-based execution system.
 * Steps are self-contained units of work that can depend on each other and execute in sequence.
 *
 * Key Concepts:
 * - Steps form a dependency graph where each step can declare prerequisites
 * - Context sharing via AsyncVar enables passing data between steps without tight coupling
 * - Steps track execution state (executed, aborted) to prevent duplicate or invalid operations
 * - Error handling provides specific error types for common failure scenarios
 *
 * Architecture:
 * The step system follows a template method pattern where BaseStep provides the execution
 * framework and derived classes implement specific analysis logic. The pipeline ensures
 * steps execute in dependency order with proper state management.
 */

import { AsyncVar } from "@rakuzen25/async-store";

import type { Dataset } from "../schema.js";
import type { LLMSession } from "../utils/ai/llms.js";
import { logger } from "../utils/core/logger.js";

/**
 * Configuration parameters for AI-powered analysis steps
 *
 * These parameters control the behavior of LLM-based analysis operations,
 * allowing fine-tuning of retry logic, creativity, and testing modes.
 */
export interface AIParameters extends Record<string, unknown> {
    /** Number of retry attempts for failed requests */
    retries?: number;
    /** Temperature setting for LLM creativity (0-2) - higher values increase randomness */
    temperature?: number;
    /** Additional custom instructions for the LLM to guide analysis */
    customPrompt?: string;
    /** Whether to simulate requests without calling LLM (for testing) */
    fakeRequest?: boolean;
    /** Number of previous messages to include as context (0 = none, -1 = all previous) */
    contextWindow?: number;
    /** Optional alias to append to model name for identification (e.g., "temp05" results in "gpt-4-temp05") */
    alias?: string;
    /** Substeps for category-filtered multi-pass coding */
    substeps?: Array<{
        /** Name for logging (e.g., "Social Codes") */
        name: string;
        /** Include only codes where any category starts with these prefixes (e.g., "Social" or ["Content", "Topic"]) */
        includeCategories?: string | string[];
        /** Exclude codes where any category starts with these prefixes (e.g., "Technical" or ["Debug", "Test"]) */
        excludeCategories?: string | string[];
        /** AI parameters specific to this substep */
        customParameters?: AIParameters;
    }>;
}

/**
 * Shared context passed between analysis steps
 *
 * This context is stored in an AsyncVar (async-local storage) allowing steps
 * to access shared data without explicit parameter passing. The context follows
 * the execution scope and is automatically cleaned up.
 */
interface StepContext {
    /** The dataset being analyzed - contains data chunks, research questions, and metadata */
    dataset: Dataset<unknown>;
    /** Optional LLM session for AI-powered steps - provides access to configured language models */
    session?: LLMSession;
}

/**
 * Base error class for step-related errors
 *
 * Provides consistent error formatting with source tracking for better debugging.
 * All step errors include the logger source context to identify where failures occur.
 */
abstract class StepError extends Error {
    override name = "BaseStep.Error";
    constructor(message: string, source?: string) {
        super(`${source ?? logger.source}: ${message}`);
    }
}

/**
 * Abstract base class for analysis pipeline steps
 *
 * BaseStep implements the core execution framework for the analysis pipeline:
 *
 * Dependency Management:
 * - Steps declare dependencies via the abstract `dependsOn` property
 * - The pipeline ensures dependencies execute first and succeed before dependent steps run
 * - Dependency failures cascade via the abort mechanism
 *
 * State Tracking:
 * - `executed`: Marks successful completion, prevents duplicate execution
 * - `aborted`: Indicates failure or dependency failure, prevents execution
 * - `_id`: Runtime identifier for logging and debugging
 *
 * Execution Flow:
 * 1. Validate step configuration (ID must be set)
 * 2. Check step state (not already executed or aborted)
 * 3. Verify all dependencies have executed successfully
 * 4. Execute step-specific logic (implemented by derived classes)
 * 5. Mark step as executed
 *
 * Context Integration:
 * - Access shared context via BaseStep.Context.get()
 * - Steps can use Context.with() to provide values for downstream steps
 *
 * Error Handling:
 * - Specific error types for different failure modes
 * - All errors include source context for debugging
 * - Abort mechanism prevents cascading invalid operations
 */
export abstract class BaseStep {
    /**
     * Dependencies that must execute before this step
     *
     * Set to undefined for steps with no dependencies (e.g., LoadStep).
     * Set to an array of steps for steps that require prior data (e.g., CodeStep depends on LoadStep).
     */
    abstract dependsOn?: BaseStep[];

    /**
     * Whether this step has completed execution successfully
     *
     * Set to true at the end of execute() to prevent re-execution.
     * Checked by dependent steps to ensure prerequisites are met.
     */
    executed = false;

    /**
     * Whether this step was aborted due to errors
     *
     * Set via abort() when:
     * - The step encounters an unrecoverable error
     * - A dependency step fails or is aborted
     * Prevents execution and cascades to dependent steps.
     */
    aborted = false;

    /**
     * Internal identifier for logging and tracking
     *
     * Set by the pipeline before execution to provide context in logs.
     * Used to correlate log messages with specific step instances.
     */
    _id = "";

    /**
     * Generate prefixed logger name for this step
     *
     * Combines the step ID (if set) with the class name for clear log messages.
     * Example: "step1 LoadStep" or "CodeStep" if no ID is set.
     */
    protected get _prefix() {
        return `${this._id ? `${this._id} ` : ""}${this.constructor.name}`;
    }

    // Error classes for different failure scenarios
    /** Base error class for all step errors */
    static Error = StepError;

    /**
     * Error for internal step failures
     *
     * Thrown when a step encounters an unexpected internal state or logic error.
     * Examples: missing step ID, invalid state transitions, unexpected data formats.
     */
    static InternalError = class extends BaseStep.Error {
        override name = "BaseStep.InternalError";
    };

    /**
     * Error when trying to use results from an unexecuted step
     *
     * Thrown when:
     * - Accessing step results before execute() completes
     * - Dependency steps haven't been executed yet
     * - Pipeline configuration error causes out-of-order execution
     */
    static UnexecutedError = class extends BaseStep.Error {
        override name = "BaseStep.UnexecutedError";
        constructor(source?: string) {
            super("Step has not been executed yet", source);
        }
    };

    /**
     * Error when step execution was aborted
     *
     * Thrown when:
     * - Attempting to execute an aborted step
     * - A dependency step was aborted, cascading the abort
     * Indicates the step cannot produce valid results.
     */
    static AbortedError = class extends BaseStep.Error {
        override name = "BaseStep.AbortedError";
        constructor(source?: string) {
            super("Step has been aborted", source);
        }
    };

    /**
     * Error for configuration issues
     *
     * Thrown when step configuration is invalid:
     * - Missing required configuration properties
     * - Invalid parameter values
     * - Conflicting configuration options
     */
    static ConfigError = class extends BaseStep.Error {
        override name = "BaseStep.ConfigError";
    };

    /**
     * Async context storage for sharing data between steps
     *
     * Uses AsyncVar for async-local storage, allowing steps to share data without
     * explicit parameter passing. Context is scoped to the async execution flow
     * and automatically isolated between concurrent step executions.
     *
     * Usage:
     * - Set: BaseStep.Context.with({ dataset, session }, async () => { ... })
     * - Get: const { dataset, session } = BaseStep.Context.get()
     */
    static Context = new AsyncVar<StepContext>("BaseStep.Context");

    /**
     * Error when required context variable is missing
     *
     * Thrown when a step tries to access context data that wasn't provided by
     * a previous step. Indicates a pipeline configuration or execution order issue.
     */
    static ContextVarNotFoundError = class extends BaseStep.Error {
        override name = "BaseStep.ContextVarNotFoundError";
        constructor(name: keyof StepContext, source?: string) {
            super(`${name} not provided in BaseStep.Context`, source);
        }
    };

    /**
     * Execute this step with dependency checking and state validation
     *
     * This is the core execution method that ensures steps run correctly:
     *
     * Validation Checks:
     * 1. Step ID is set (indicates proper pipeline initialization)
     * 2. Step hasn't already executed (prevents duplicate work)
     * 3. Step hasn't been aborted (prevents invalid execution)
     * 4. All dependencies have executed successfully
     *
     * Execution Flow:
     * 1. Perform all validation checks
     * 2. Return a resolved promise (derived classes override to add logic)
     * 3. Derived classes call super.execute() first, then add their logic
     * 4. Set this.executed = true when complete
     *
     * Error Handling:
     * - Throws InternalError if step ID not set
     * - Throws ConfigError if step already executed
     * - Throws AbortedError if step or dependencies aborted
     * - Throws UnexecutedError if dependencies haven't run
     *
     * @returns Promise that resolves when base validation completes
     */
    execute() {
        logger.withSource(this._prefix, "execute", () => {
            // Validate step is properly configured with an ID
            if (!this._id) {
                throw new BaseStep.InternalError("Step ID is not set");
            }
            // Prevent double execution which could corrupt results
            if (this.executed) {
                throw new BaseStep.ConfigError(
                    "Step has already been executed, please check job configuration",
                );
            }
            // Check if step was aborted (either directly or via dependency)
            if (this.aborted) {
                throw new BaseStep.AbortedError();
            }
            // Verify all dependencies have executed successfully
            if (this.dependsOn) {
                for (const step of this.dependsOn) {
                    // Cascade aborts from dependencies
                    if (step.aborted) {
                        this.abort(step);
                        throw new BaseStep.AbortedError();
                    }
                    // Ensure dependency has run (indicates pipeline ordering issue)
                    if (!step.executed) {
                        throw new BaseStep.UnexecutedError();
                    }
                }
            }
        });

        return Promise.resolve();
    }

    /**
     * Mark this step as aborted, preventing execution
     *
     * Abort reasons:
     * - Dependency step failed or was aborted
     * - Step encountered an unrecoverable error
     * - User cancelled operation (e.g., in human coding)
     *
     * Effects:
     * - Sets aborted flag to true
     * - Prevents execute() from running
     * - Cascades to dependent steps (they will abort when they check dependencies)
     * - Logs warning message with optional dependency context
     *
     * @param dep - Optional dependency step that caused this abort
     */
    abort(dep?: BaseStep) {
        logger.withSource(this._prefix, "abort", () => {
            logger.warn(`Aborting${dep ? `: dependency ${dep._id} aborted` : ""}`);
            this.aborted = true;
        });
    }
}
