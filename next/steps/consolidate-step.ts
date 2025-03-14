import type { DataItem } from "../schema";
import type { LLMModel } from "../utils/llms";

import type { AIParameters, ConsolidateStrategy } from "./base-step";
import { BaseStep } from "./base-step";
import type { CodeStep } from "./code-step";

export interface ConsolidateStepConfig<T extends DataItem> {
    Coder?: CodeStep<T> | CodeStep<T>[]; // Defaults to all coders
    Strategy: ConsolidateStrategy;
    Model: LLMModel | LLMModel[];
    Parameters?: AIParameters;
}

export class ConsolidateStep<T extends DataItem> extends BaseStep {
    _type = "Consolidate";
    constructor(private readonly Config: ConsolidateStepConfig<T>) {
        super();
    }

    async execute() {
        // Call some functions to consolidate the data
    }
}
