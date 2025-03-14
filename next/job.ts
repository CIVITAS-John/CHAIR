import { logger } from "./logger";
import type { BaseStep } from "./steps/base-step";

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
const validateSteps = (steps: BaseStep[]) => steps.map(validateStep);

export class QAJob {
    /**
     * An array of dependency groups, where each group is an array of steps that
     * can be executed in parallel. The dependency groups are executed in sequence.
     */
    steps: BaseStep[][];

    static ConfigError = class extends Error {};

    #assignID() {
        if (!this.steps.length) {
            logger.warn("No steps provided", "QAJob#assignID");
            return;
        }
        this.steps.forEach((steps, i) => {
            steps.forEach((step, j) => {
                step._id = `${i}.${j}`;
            });
        });
    }

    constructor(private readonly config: QAJobConfig) {
        const source = "QAJob#constructor";
        logger.info("Creating job", source);

        if (!Array.isArray(config.steps[0])) {
            // Config.Steps is a flattened 1D array
            const stepsFlat = config.steps as BaseStep[];
            logger.debug(`Received ${stepsFlat.length} steps in a flat array`, source);

            if (config.parallel) {
                // We group the steps by type - load, code, then consolidate
                this.steps = [[], [], []];
                // Classify each step
                stepsFlat.forEach((Step) => this.steps[validateStep(Step)].push(Step));
                logger.debug(
                    `Grouped steps: ${this.steps.map((group) => group.length).join(", ")}`,
                    source,
                );
            } else {
                // We just have one group of steps in sequence
                this.steps = [stepsFlat];
            }

            this.#assignID();
            logger.info(`Created job with ${stepsFlat.length} steps`, source);
            return;
        }
        // Config.Steps is a 2D array
        logger.debug(`Received ${config.steps.length} dependency groups`, source);

        // Validate each dependency group and each step
        config.steps.forEach((steps) => {
            if (!Array.isArray(steps)) {
                // The dependency group is not an array
                throw new QAJob.ConfigError(`Invalid dependency group: ${JSON.stringify(steps)}`);
            }
            validateSteps(steps);
        });

        // Assign the provided steps
        this.steps = config.steps as BaseStep[][];

        this.#assignID();
        logger.info(
            `Created job with ${this.steps.length} dependency groups (${this.steps.map((group) => group.length).join(", ")} steps)`,
            source,
        );
    }

    async execute() {
        logger.info("Executing job", "QAJob#execute");
        // Execute each dependency group in sequence
        for (const [i, steps] of this.steps.entries()) {
            logger.info(`Executing dependency group ${i + 1}`, "QAJob#execute");
            if (this.config.parallel) {
                // Execute the steps in parallel
                await Promise.all(steps.map((step) => step.execute()));
            } else {
                // Execute the steps in sequence
                for (const [j, step] of steps.entries()) {
                    logger.info(`Executing step ${j + 1}`, "QAJob#execute");
                    await step.execute();
                    logger.info(`Executed step ${j + 1}`, "QAJob#execute");
                }
            }
            logger.info(`Executed dependency group ${i + 1}`, "QAJob#execute");
        }
    }
}
