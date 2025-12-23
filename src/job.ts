/**
 * Job Module
 *
 * Orchestrates the execution of qualitative analysis workflows.
 * This module manages:
 * - Step dependency resolution and execution order
 * - Parallel and sequential execution modes
 * - Async context management for shared resources
 * - Job lifecycle from configuration to completion
 *
 * The job system uses async-local storage (AsyncVar) to provide steps with
 * access to shared resources like embedders and Python paths without explicit
 * parameter passing through the call stack.
 */

import { AsyncScope, AsyncVar } from "@rakuzen25/async-store";

import { BaseStep } from "./steps/base-step.js";
import type { CodeStepConfig } from "./steps/code-step.js";
import { CodeStep } from "./steps/code-step.js";
import type { ConsolidateStepConfig } from "./steps/consolidate-step.js";
import { ConsolidateStep } from "./steps/consolidate-step.js";
import type { EvaluateStepConfig } from "./steps/evaluate-step.js";
import { EvaluateStep } from "./steps/evaluate-step.js";
import type { LoadStepConfig } from "./steps/load-step.js";
import { LoadStep } from "./steps/load-step.js";
import type { EmbedderModel, EmbedderObject } from "./utils/ai/embeddings.js";
import { initEmbedder } from "./utils/ai/embeddings.js";
import { logger } from "./utils/core/logger.js";

/**
 * Configuration for a qualitative analysis job.
 */
export interface QAJobConfig {
    /** Embedding model for semantic analysis (required for consolidate/evaluate steps) */
    embedder?: EmbedderModel;
    /** Steps to execute, either flat array or grouped by dependency */
    steps?: BaseStep[] | BaseStep[][];
    /** Whether to execute steps within groups in parallel (default: false) */
    parallel?: boolean;
    /** Path to Python executable for external scripts */
    pythonPath?: string;
}

/**
 * Async-local context shared across all steps in a job execution.
 * This context is set once per job and accessible via QAJob.Context.get()
 * from any nested function call without explicit parameter passing.
 */
interface IJobContext {
    /** Path to Python executable for external analysis tools */
    pythonPath?: string;
    /** Embedding model instance for semantic operations */
    embedder?: EmbedderObject;
}

/**
 * Base error class for job-related errors.
 */
abstract class QAJobError extends Error {
    override name = "QAJob.Error";
    constructor(message: string, source?: string) {
        super(`${source ?? logger.source}: ${message}`);
    }
}

/**
 * Validates and classifies a step into its dependency tier.
 *
 * Steps are organized into dependency tiers based on their type:
 * - Tier 0: LoadStep (loads datasets)
 * - Tier 1: CodeStep (codes datasets, depends on LoadStep)
 * - Tier 2: ConsolidateStep (consolidates codes, depends on CodeStep)
 * - Tier 3: EvaluateStep (evaluates codebooks, depends on ConsolidateStep)
 *
 * @param step - The step to validate and classify
 * @returns The dependency tier (0-3)
 * @throws {QAJob.ConfigError} If step type is unknown
 */
const validateStep = (step: BaseStep) => {
    if (step instanceof LoadStep) {
        return 0;
    }
    if (step instanceof CodeStep) {
        return 1;
    }
    if (step instanceof ConsolidateStep) {
        return 2;
    }
    if (step instanceof EvaluateStep) {
        return 3;
    }
    throw new QAJob.ConfigError(`Unknown step type: ${step.constructor.name}`);
};

/**
 * Orchestrates the execution of a qualitative analysis workflow.
 *
 * **Step Organization:**
 * Steps are organized into dependency groups (2D array). Each group contains
 * steps that can execute in parallel (if config.parallel=true). Groups execute
 * sequentially to respect dependencies.
 *
 * **Dependency Management:**
 * - Each step can specify dependencies via `step.dependsOn`
 * - Steps automatically infer dependencies from previous groups if not specified
 * - LoadStep has no dependencies
 * - CodeStep depends on LoadStep(s)
 * - ConsolidateStep depends on CodeStep(s)
 * - EvaluateStep depends on ConsolidateStep(s)
 *
 * **Execution Modes:**
 * - Parallel mode (config.parallel=true): Steps within a group run concurrently
 * - Sequential mode (config.parallel=false): All steps run one after another
 *
 * **Async Context Pattern:**
 * The job creates an AsyncScope and sets QAJob.Context with shared resources.
 * Steps can access this context anywhere in their call stack via QAJob.Context.get()
 * without explicit parameter passing.
 *
 * **Lifecycle:**
 * 1. Constructor: Validates steps, resolves dependencies, assigns IDs
 * 2. execute(): Runs each dependency group in sequence
 * 3. For each group: Runs steps in parallel or sequence based on config
 * 4. For each step: Creates AsyncScope, sets context, executes step
 */
export class QAJob {
    /**
     * Array of dependency groups, where each group is an array of steps that
     * can be executed in parallel. The dependency groups are executed in sequence.
     *
     * Structure: steps[groupIndex][stepIndex]
     * Example: [[LoadStep1, LoadStep2], [CodeStep1, CodeStep2], [ConsolidateStep]]
     */
    steps: BaseStep[][];

    /** Embedding model instance for consolidation and evaluation steps */
    embedder?: EmbedderObject;

    /** Error thrown when job configuration is invalid */
    static ConfigError = class extends QAJobError {
        override name = "QAJob.ConfigError";
    };

    /**
     * Async-local storage for job-wide context.
     * Set once per job execution and accessible from any nested call.
     */
    static Context = new AsyncVar<IJobContext>("QAJob.Context");

    /** Error thrown when required context variable is not found */
    static ContextVarNotFoundError = class extends BaseStep.Error {
        override name = "QAJob.ContextVarNotFoundError";
        constructor(name: keyof IJobContext, source?: string) {
            super(`${name} not provided in QAJob.Context`, source);
        }
    };

    /**
     * Assigns unique IDs to all steps and validates embedder requirements.
     *
     * Step IDs follow the format "{groupIndex}.{stepIndex}" (1-indexed).
     * Example: Step ID "2.3" is the 3rd step in the 2nd dependency group.
     *
     * Also validates that an embedder is provided if any ConsolidateStep or
     * EvaluateStep is present, as these require semantic analysis capabilities.
     *
     * @throws {QAJob.ConfigError} If embedder missing for consolidate/evaluate steps
     */
    #assignID() {
        if (!this.steps.length) {
            logger.warn("No steps provided", "QAJob#assignID");
            return;
        }

        this.steps.forEach((steps, i) => {
            steps.forEach((step, j) => {
                step._id = `${i + 1}.${j + 1}`;
                if (step instanceof ConsolidateStep || step instanceof EvaluateStep) {
                    if (!this.embedder) {
                        throw new QAJob.ConfigError(
                            "Embedder not provided for consolidation/evaluation",
                        );
                    }
                }
            });
        });
    }

    /**
     * Creates a new qualitative analysis job.
     *
     * **Configuration Modes:**
     *
     * 1. **Flat Array (Auto-grouping):**
     *    - config.steps = [step1, step2, step3, ...]
     *    - Steps are automatically grouped by type into dependency tiers
     *    - Dependencies are inferred: Load → Code → Consolidate → Evaluate
     *    - If config.parallel=true, steps in same tier execute concurrently
     *    - If config.parallel=false, all steps execute sequentially
     *
     * 2. **2D Array (Manual grouping):**
     *    - config.steps = [[group1_step1, group1_step2], [group2_step1], ...]
     *    - Groups execute sequentially, steps within groups can run in parallel
     *    - Dependencies are validated and auto-inferred if not specified
     *    - Must respect dependency hierarchy (no circular dependencies)
     *
     * **Dependency Resolution:**
     * - If step.dependsOn is empty, it inherits from all steps in previous groups
     * - If step.dependsOn is specified, it must reference steps in earlier groups
     * - CodeStep can only depend on LoadStep
     * - ConsolidateStep can only depend on CodeStep
     * - EvaluateStep can only depend on ConsolidateStep
     *
     * @param config - Job configuration with steps, embedder, and execution mode
     * @throws {QAJob.ConfigError} If configuration is invalid (duplicates, bad dependencies, etc.)
     */
    constructor(private readonly config: QAJobConfig) {
        // At this point, we are not running in a scope, so we need to set the logger source manually
        const _id = "QAJob#constructor";
        logger.info("Creating job", _id);

        if (!config.steps) {
            logger.debug("No steps provided in the config directly", _id);
            this.steps = [];
            return;
        }

        // Initialize embedder (either instance or model name)
        this.embedder =
            typeof this.config.embedder === "string"
                ? initEmbedder(this.config.embedder)
                : this.config.embedder;

        // Handle flat array configuration (auto-grouping mode)
        if (!Array.isArray(config.steps[0])) {
            const stepsFlat = config.steps as BaseStep[];
            logger.debug(`Received ${stepsFlat.length} steps in a flat array`, _id);

            // Validate: Check for duplicate step instances
            const stepSet = new Set<BaseStep>();
            stepsFlat.forEach((step, si) => {
                if (stepSet.has(step)) {
                    throw new QAJob.ConfigError(`Step ${si + 1} is a duplicate`);
                }
                stepSet.add(step);
            });

            // Auto-group steps by type into dependency tiers
            // Tier 0: LoadStep, Tier 1: CodeStep, Tier 2: ConsolidateStep, Tier 3: EvaluateStep
            this.steps = [[], [], [], []];
            stepsFlat.forEach((step) => this.steps[validateStep(step)].push(step));

            // Auto-infer dependencies: each tier depends on all steps in previous tier
            for (let i = 1; i < 4; i++) {
                this.steps[i].forEach((step) => {
                    if (!step.dependsOn?.length) {
                        step.dependsOn = this.steps[i - 1];
                    }
                });
            }

            // Remove empty tiers
            this.steps = this.steps.filter((group) => group.length);
            logger.debug(
                `Grouped steps: ${this.steps.map((group) => group.length).join(", ")}`,
                _id,
            );

            // If non-parallel mode, flatten to single sequential group
            if (!config.parallel) {
                this.steps = [stepsFlat];
            }

            this.#assignID();
            logger.info(`Created job with ${stepsFlat.length} steps`, _id);
            return;
        }

        // Handle 2D array configuration (manual grouping mode)
        logger.debug(`Received ${config.steps.length} dependency groups`, _id);

        // Validate dependency groups and resolve dependencies
        const prevSteps = new Set<BaseStep>(); // Track all steps seen so far
        config.steps.forEach((steps, gi) => {
            if (!Array.isArray(steps)) {
                throw new QAJob.ConfigError(
                    `Invalid dependency group ${gi + 1}: ${JSON.stringify(steps)}`,
                );
            }
            steps.forEach((step, si) => {
                validateStep(step); // Validate step type

                // Check for duplicate step instances across all groups
                if (prevSteps.has(step)) {
                    throw new QAJob.ConfigError(`Step ${gi + 1}.${si + 1} is a duplicate`);
                }

                // Resolve and validate dependencies
                if (step.dependsOn) {
                    if (!step.dependsOn.length) {
                        // Auto-infer: depend on all compatible steps from previous groups
                        step.dependsOn = [...prevSteps].filter(
                            (prevStep) =>
                                prevStep instanceof
                                (step instanceof CodeStep
                                    ? LoadStep
                                    : step instanceof ConsolidateStep
                                      ? CodeStep
                                      : ConsolidateStep),
                        );
                    } else if (step.dependsOn.some((dep) => !prevSteps.has(dep))) {
                        // Validate: all dependencies must be in previous groups
                        throw new QAJob.ConfigError(
                            `Step ${gi + 1}.${si + 1} has unresolved dependencies`,
                        );
                    }
                }
            });
            // Add steps to prevSteps AFTER processing group (prevents intra-group dependencies)
            steps.forEach((step) => prevSteps.add(step));
        });

        // Assign the validated steps
        this.steps = config.steps as BaseStep[][];
        // Remove empty groups
        this.steps = this.steps.filter((group) => group.length);

        this.#assignID();
        logger.info(
            `Created job with ${this.steps.length} dependency groups (${this.steps.map((group) => group.length).join(", ")} steps)`,
            _id,
        );
    }

    /**
     * Adds a step to the job dynamically.
     *
     * If no dependency groups exist, creates a new group.
     * Otherwise, adds to the last dependency group.
     * Reassigns all step IDs after adding.
     *
     * @param step - The step to add
     * @returns The added step (for chaining)
     */
    addStep(step: BaseStep) {
        logger.info(`Adding step of type ${step.constructor.name}`, "QAJob#addStep");
        if (this.steps.length === 0) {
            this.steps.push([step]);
        } else {
            this.steps[this.steps.length - 1].push(step);
        }
        step._id = `${this.steps.length}.${this.steps[this.steps.length - 1].length}`;
        this.#assignID();
        return step;
    }

    /** Creates and adds a LoadStep to the job */
    addLoadStep(config: LoadStepConfig) {
        return this.addStep(new LoadStep(config));
    }

    /** Creates and adds a CodeStep to the job */
    addCodeStep(config: CodeStepConfig) {
        return this.addStep(new CodeStep(config));
    }

    /** Creates and adds a ConsolidateStep to the job */
    addConsolidateStep(config: ConsolidateStepConfig) {
        return this.addStep(new ConsolidateStep(config));
    }

    /** Creates and adds an EvaluateStep to the job */
    addEvaluateStep(config: EvaluateStepConfig) {
        return this.addStep(new EvaluateStep(config));
    }

    /**
     * Executes a single step within an async context.
     *
     * Creates a new AsyncScope and sets the job context (pythonPath, embedder)
     * so that the step and all its nested calls can access these resources via
     * QAJob.Context.get() without explicit parameter passing.
     *
     * Handles step abortion gracefully - if a step is aborted and throws
     * AbortedError, logs a warning instead of propagating the error.
     *
     * @param step - The step to execute
     * @throws Re-throws any non-abortion errors from the step
     */
    async #executeStep(step: BaseStep) {
        await new AsyncScope().run(async () => {
            // Set job context for this async scope
            QAJob.Context.set({
                pythonPath: this.config.pythonPath,
                embedder: this.embedder,
            });
            await logger.withSource("QAJob#executeStep", async () => {
                logger.info(`Executing step ${step._id}`);
                try {
                    await step.execute();
                } catch (error) {
                    // Handle graceful abortion
                    if (error instanceof BaseStep.AbortedError && step.aborted) {
                        logger.warn(`Step ${step._id} aborted`);
                        return;
                    }
                    throw error; // Re-throw other errors
                }
                logger.info(`Executed step ${step._id}`);
            });
        });
    }

    /**
     * Executes the entire job workflow.
     *
     * **Execution Flow:**
     * 1. Iterates through dependency groups sequentially (respects dependencies)
     * 2. Within each group:
     *    - If config.parallel=true: Executes all steps concurrently via Promise.all
     *    - If config.parallel=false: Executes steps one by one in sequence
     * 3. Each step runs in its own AsyncScope with shared job context
     * 4. Logs progress at group and job level
     *
     * **Error Handling:**
     * - Step failures propagate up and stop job execution
     * - Aborted steps are logged but don't stop execution
     *
     * @returns Promise that resolves when all steps complete successfully
     * @throws Propagates errors from failed steps
     */
    async execute() {
        const _id = "QAJob#execute";
        logger.info("Executing job", _id);

        // Execute each dependency group in sequence
        for (const [i, steps] of this.steps.entries()) {
            logger.info(`Executing dependency group ${i + 1}`, _id);
            if (this.config.parallel) {
                // Execute the steps in parallel within this group
                await Promise.all(steps.map((step) => this.#executeStep(step)));
            } else {
                // Execute the steps in sequence
                for (const step of steps) {
                    await this.#executeStep(step);
                }
            }
            logger.success(`Executed dependency group ${i + 1}`, _id);
        }

        logger.success("Job successfully executed", _id);
    }
}
