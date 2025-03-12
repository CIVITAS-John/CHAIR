import type { BaseStep } from "./steps/base-step";

export interface QAJobConfig {
    EmbeddingModel: string;
    Steps: BaseStep[] | BaseStep[][];
    Parallel?: boolean;
}

const validateStep = (Step: BaseStep) => {
    switch (Step._type) {
        case "Load":
            return 0;
        case "Code":
            return 1;
        case "Consolidate":
            return 2;
        default:
            throw new Error(`Unknown step type: ${Step._type}`);
    }
};
const validateSteps = (Steps: BaseStep[]) => Steps.map(validateStep);

export class QAJob {
    /**
     * An array of dependency groups, where each group is an array of steps that
     * can be executed in parallel. The dependency groups are executed in sequence.
     */
    Steps: BaseStep[][];
    constructor(private readonly Config: QAJobConfig) {
        if (!Array.isArray(Config.Steps[0])) {
            // Config.Steps is a flattened 1D array
            const stepsFlat = Config.Steps as BaseStep[];
            if (Config.Parallel) {
                // We group the steps by type - load, code, then consolidate
                this.Steps = [[], [], []];
                // Classify each step
                stepsFlat.forEach((Step) => this.Steps[validateStep(Step)].push(Step));
            } else {
                // We just have one group of steps in sequence
                this.Steps = [stepsFlat];
            }
            return;
        }
        // Config.Steps is a 2D array
        // Validate each dependency group and each step
        Config.Steps.forEach((Steps) => {
            if (!Array.isArray(Steps)) {
                // The dependency group is not an array
                throw new Error(`Invalid dependency group: ${JSON.stringify(Steps)}`);
            }
            validateSteps(Steps);
        });
        // Assign the provided steps
        this.Steps = Config.Steps as BaseStep[][];
    }

    async Execute() {
        // Execute each dependency group in sequence
        for (const Steps of this.Steps) {
            if (this.Config.Parallel) {
                // Execute the steps in parallel
                await Promise.all(Steps.map((Step) => Step.Execute()));
            } else {
                // Execute the steps in sequence
                for (const Step of Steps) {
                    await Step.Execute();
                }
            }
        }
    }
}
