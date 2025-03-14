import type { BaseStep } from "./steps/base-step";
import { logger } from "./utils/logger";

export interface QAJobConfig {
    embeddingModel: string;
    steps: BaseStep[] | BaseStep[][];
    parallel?: boolean;
}

const validateStep = (step: BaseStep) => {
    switch (step._type) {
        case "Load":
            return 0;
        case "Code":
            return 1;
        case "Consolidate":
            return 2;
        default:
            throw new QAJob.ConfigError(`Unknown step type: ${step._type}`);
    }
};

export class QAJob {
    /**
     * An array of dependency groups, where each group is an array of steps that
     * can be executed in parallel. The dependency groups are executed in sequence.
     */
    steps: BaseStep[][];

    static ConfigError = class extends Error {
        name = "QAJob.ConfigError";
    };

    #assignID() {
        if (!this.steps.length) {
            logger.warn("No steps provided", "QAJob#assignID");
            return;
        }
        this.steps.forEach((steps, i) => {
            steps.forEach((step, j) => {
                step._id = `${i + 1}.${j + 1}`;
            });
        });
    }

    constructor(private readonly config: QAJobConfig) {
        const _id = "QAJob#constructor";
        logger.info("Creating job", _id);

        if (!Array.isArray(config.steps[0])) {
            // config.steps is a flattened 1D array
            const stepsFlat = config.steps as BaseStep[];
            logger.debug(`Received ${stepsFlat.length} steps in a flat array`, _id);

            // Check for duplicates
            const stepSet = new Set<BaseStep>();
            stepsFlat.forEach((step, si) => {
                if (stepSet.has(step)) {
                    throw new QAJob.ConfigError(`Step ${si + 1} is a duplicate`);
                }
                stepSet.add(step);
            });

            if (config.parallel) {
                // We group the steps by type - load, code, then consolidate
                this.steps = [[], [], []];
                // Classify each step
                stepsFlat.forEach((Step) => this.steps[validateStep(Step)].push(Step));
                // Set the dependencies of Code and Consolidate steps if not provided
                this.steps[1].forEach((codeStep) => {
                    if (!codeStep.dependsOn?.length) {
                        codeStep.dependsOn = this.steps[0];
                    }
                });
                this.steps[2].forEach((consolidateStep) => {
                    if (!consolidateStep.dependsOn?.length) {
                        consolidateStep.dependsOn = this.steps[1];
                    }
                });
                // Remove empty groups
                this.steps = this.steps.filter((group) => group.length);
                logger.debug(
                    `Grouped steps: ${this.steps.map((group) => group.length).join(", ")}`,
                    _id,
                );
            } else {
                // We just have one group of steps in sequence
                this.steps = [stepsFlat];
            }

            this.#assignID();
            logger.info(`Created job with ${stepsFlat.length} steps`, _id);
            return;
        }
        // config.steps is a 2D array
        logger.debug(`Received ${config.steps.length} dependency groups`, _id);

        // Validate each dependency group and each step
        const prevSteps = new Set<BaseStep>();
        config.steps.forEach((steps, gi) => {
            if (!Array.isArray(steps)) {
                // The dependency group is not an array
                throw new QAJob.ConfigError(
                    `Invalid dependency group ${gi + 1}: ${JSON.stringify(steps)}`,
                );
            }
            steps.forEach((step, si) => {
                validateStep(step);
                // Check for duplicates
                if (prevSteps.has(step)) {
                    throw new QAJob.ConfigError(`Step ${gi + 1}.${si + 1} is a duplicate`);
                }
                if (step.dependsOn) {
                    // It's a Code or Consolidate step with dependencies
                    if (!step.dependsOn.length) {
                        // Set the dependencies to all previous steps
                        step.dependsOn = [...prevSteps].filter(
                            (prevStep) =>
                                prevStep._type === (step._type === "Code" ? "Load" : "Code"),
                        );
                    } else if (step.dependsOn.some((dep) => !prevSteps.has(dep))) {
                        throw new QAJob.ConfigError(
                            `Step ${gi + 1}.${si + 1} has unresolved dependencies`,
                        );
                    }
                }
            });
            // Only add the steps at the end to prevent dependencies within the same group
            steps.forEach((step) => prevSteps.add(step));
        });

        // Assign the provided steps
        this.steps = config.steps as BaseStep[][];
        // Remove empty groups
        this.steps = this.steps.filter((group) => group.length);

        this.#assignID();
        logger.info(
            `Created job with ${this.steps.length} dependency groups (${this.steps.map((group) => group.length).join(", ")} steps)`,
            _id,
        );
    }

    async execute() {
        const _id = "QAJob#execute";
        logger.info("Executing job", _id);

        // Execute each dependency group in sequence
        for (const [i, steps] of this.steps.entries()) {
            logger.info(`Executing dependency group ${i + 1}`, _id);
            if (this.config.parallel) {
                // Execute the steps in parallel
                await Promise.all(steps.map((step) => step.execute()));
            } else {
                // Execute the steps in sequence
                for (const [j, step] of steps.entries()) {
                    logger.info(`Executing step ${j + 1}`, _id);
                    await step.execute();
                    logger.info(`Executed step ${j + 1}`, _id);
                }
            }
            logger.success(`Executed dependency group ${i + 1}`, _id);
        }

        logger.success("Job successfully executed", _id);
    }
}
