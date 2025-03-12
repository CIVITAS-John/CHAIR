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
            throw new Error(`Unknown step type: ${step._type}`);
    }
};
const validateSteps = (steps: BaseStep[]) => steps.map(validateStep);

export class QAJob {
    /**
     * An array of dependency groups, where each group is an array of steps that
     * can be executed in parallel. The dependency groups are executed in sequence.
     */
    steps: BaseStep[][];
    constructor(private readonly config: QAJobConfig) {
        logger.info("Creating job", "QAJob#constructor");

        if (!Array.isArray(config.steps[0])) {
            // Config.Steps is a flattened 1D array
            const stepsFlat = config.steps as BaseStep[];
            logger.debug(`Received ${stepsFlat.length} steps in a flat array`, "QAJob#constructor");

            if (config.parallel) {
                // We group the steps by type - load, code, then consolidate
                this.steps = [[], [], []];
                // Classify each step
                stepsFlat.forEach((Step) => this.steps[validateStep(Step)].push(Step));
                logger.debug(
                    `Grouped steps: ${this.steps.map((group) => group.length).join(", ")}`,
                    "QAJob#constructor",
                );
            } else {
                // We just have one group of steps in sequence
                this.steps = [stepsFlat];
            }

            logger.info(`Created job with ${stepsFlat.length} steps`, "QAJob#constructor");
            return;
        }
        // Config.Steps is a 2D array
        logger.debug(`Received ${config.steps.length} dependency groups`, "QAJob#constructor");

        // Validate each dependency group and each step
        config.steps.forEach((steps) => {
            if (!Array.isArray(steps)) {
                // The dependency group is not an array
                throw new Error(`Invalid dependency group: ${JSON.stringify(steps)}`);
            }
            validateSteps(steps);
        });

        // Assign the provided steps
        this.steps = config.steps as BaseStep[][];

        logger.info(
            `Created job with ${this.steps.length} dependency groups (${this.steps.map((group) => group.length).join(", ")} steps)`,
            "QAJob#constructor",
        );
    }

    async execute() {
        logger.info("Executing job", "QAJob#execute");
        // Execute each dependency group in sequence
        for (const [i, steps] of this.steps.entries()) {
            logger.info(`Executing dependency group ${i + 1}`, "QAJob#execute");
            if (this.config.parallel) {
                // Execute the steps in parallel
                steps.forEach((step, j) => (step._id = `${i + 1}.${j + 1}`));
                await Promise.all(steps.map((step) => step.execute()));
            } else {
                // Execute the steps in sequence
                for (const [j, step] of steps.entries()) {
                    logger.info(`Executing step ${j + 1}`, "QAJob#execute");
                    step._id = `${i + 1}.${j + 1}`;
                    await step.execute();
                    logger.info(`Executed step ${j + 1}`, "QAJob#execute");
                }
            }
            logger.info(`Executed dependency group ${i + 1}`, "QAJob#execute");
        }
    }
}
