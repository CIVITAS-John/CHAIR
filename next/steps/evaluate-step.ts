import type { DataChunk, DataItem } from "../schema";

import { BaseStep } from "./base-step";
import type { ConsolidateStep } from "./consolidate-step";

export interface EvaluateStepConfig<
    TUnit extends DataChunk<TSubunit>,
    TSubunit extends DataItem = DataItem,
> {
    consolidator?: ConsolidateStep<TUnit, TSubunit> | ConsolidateStep<TUnit, TSubunit>[]; // Defaults to all consolidators
}

export class EvaluateStep<
    TUnit extends DataChunk<TSubunit>,
    TSubunit extends DataItem = DataItem,
> extends BaseStep {
    override _type = "Evaluate";
    override dependsOn: ConsolidateStep<TUnit, TSubunit>[];

    constructor(private readonly config: EvaluateStepConfig<TUnit, TSubunit>) {
        super();

        // If config.coder is not provided, we will consolidate all codes
        this.dependsOn = config.consolidator
            ? Array.isArray(config.consolidator)
                ? config.consolidator
                : [config.consolidator]
            : [];
    }

    override async execute() {
        await super.execute();

        this.executed = true;
    }
}
