import type { DataChunk, DataItem } from "../schema";
import type { LLMModel } from "../utils/llms";

import type { AIParameters, ConsolidateStrategy } from "./base-step";
import { BaseStep } from "./base-step";
import type { CodeStep } from "./code-step";

export interface ConsolidateStepConfig<
    TUnit extends DataChunk<TSubunit>,
    TSubunit extends DataItem = DataItem,
> {
    coder?: CodeStep<TUnit, TSubunit> | CodeStep<TUnit, TSubunit>[]; // Defaults to all coders
    strategy: ConsolidateStrategy;
    model: LLMModel | LLMModel[];
    parameters?: AIParameters;
}

export class ConsolidateStep<
    TUnit extends DataChunk<TSubunit>,
    TSubunit extends DataItem = DataItem,
> extends BaseStep {
    override _type = "Consolidate";
    override dependsOn: CodeStep<TUnit, TSubunit>[];

    constructor(private readonly config: ConsolidateStepConfig<TUnit, TSubunit>) {
        super();

        // If config.coder is not provided, we will consolidate all codes
        this.dependsOn = config.coder
            ? Array.isArray(config.coder)
                ? config.coder
                : [config.coder]
            : [];
    }

    override async execute() {
        await super.execute();

        this.executed = true;
    }
}
