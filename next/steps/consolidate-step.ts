import type { AIParameters, ConsolidateStrategy, LLMModel } from "./base-step";
import { BaseStep } from "./base-step";
import type { CodeStep } from "./code-step";

export interface ConsolidateStepConfig {
    Coder?: CodeStep | CodeStep[]; // Defaults to all coders
    Strategy: ConsolidateStrategy;
    Model: LLMModel | LLMModel[];
    Parameters?: AIParameters;
}

export class ConsolidateStep extends BaseStep {
    _type = "Consolidate";
    constructor(private readonly Config: ConsolidateStepConfig) {
        super();
    }

    async Execute() {
        // Call some functions to consolidate the data
    }
}
