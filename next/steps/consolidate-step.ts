import type { DataItem } from "../schema";
import type { LLMModel } from "../utils/llms";

import type { AIParameters, ConsolidateStrategy } from "./base-step";
import { BaseStep } from "./base-step";
import type { CodeStep } from "./code-step";

export interface ConsolidateStepConfig<T extends DataItem> {
    coder?: CodeStep<T> | CodeStep<T>[]; // Defaults to all coders
    strategy: ConsolidateStrategy;
    model: LLMModel | LLMModel[];
    parameters?: AIParameters;
}

export class ConsolidateStep<T extends DataItem = DataItem> extends BaseStep {
    _type = "Consolidate";
    dependsOn: CodeStep<T>[];

    constructor(private readonly config: ConsolidateStepConfig<T>) {
        super();

        // If config.coder is not provided, we will consolidate all codes
        this.dependsOn = config.coder
            ? Array.isArray(config.coder)
                ? config.coder
                : [config.coder]
            : [];
    }

    async execute() {
        await super.execute();

        this.executed = true;
    }
}
