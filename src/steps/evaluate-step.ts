import { writeFileSync } from "fs";
import { join } from "path";

// import type { CodebookEvaluator } from "../evaluating/codebooks";
import { NetworkEvaluator } from "../evaluating/network-evaluator.js";
import type { Codebook, DataChunk, DataItem, Dataset } from "../schema.js";
import { ensureFolder } from "../utils/file.js";
import { logger } from "../utils/logger.js";

import { BaseStep } from "./base-step.js";
import type { ConsolidateStep } from "./consolidate-step.js";

export interface EvaluateStepConfig<
    TSubunit extends DataItem = DataItem,
    TUnit extends DataChunk<TSubunit> = DataChunk<TSubunit>,
> {
    // evaluator: new () => CodebookEvaluator;
    consolidator: ConsolidateStep<TSubunit, TUnit>;
    subdir?: string; // Defaults to "evaluation"
    ignoreGroups?: boolean; // Defaults to false
    anonymize?: boolean; // Defaults to true
    parameters?: Record<string, any>; // Extra parameters for the evaluation
}

export class EvaluateStep<
    TUnit extends DataChunk<TSubunit>,
    TSubunit extends DataItem = DataItem,
> extends BaseStep {
    override dependsOn: ConsolidateStep<TSubunit, TUnit>[];

    ignoreGroups: boolean;

    constructor(private readonly config: EvaluateStepConfig<TSubunit, TUnit>) {
        super();
        // If config.consolidator is not provided, we will evaluate all consolidators
        this.dependsOn = [config.consolidator];
        this.ignoreGroups = config.ignoreGroups ?? false;
    }

    async #execute() {
        const datasets: Dataset<TUnit[]>[] = [],
            codebooks = new Map<string, Record<string, Codebook>>(),
            groups = new Map<string, Record<string, [Codebook, string[]]>>(),
            references = new Map<string, Codebook>();
        const consolidator = this.config.consolidator;
        consolidator.datasets.forEach((dataset) => {
            datasets.push(dataset);
            codebooks.set(dataset.name, consolidator.getCodebooks(dataset.name));
            groups.set(dataset.name, consolidator.getGroups(dataset.name));
            references.set(dataset.name, consolidator.getReference(dataset.name));
        });

        for (const dataset of datasets.values()) {
            await BaseStep.Context.with(
                {
                    dataset,
                },
                async () => {
                    const evaluator = new NetworkEvaluator({
                        dataset: dataset as unknown as Dataset<TUnit>,
                        parameters: this.config.parameters ?? {},
                        anonymize: this.config.anonymize ?? true,
                    });
                    const codes = codebooks.get(dataset.name) ?? {};
                    const gs = this.ignoreGroups ? {} : (groups.get(dataset.name) ?? {});
                    const exportPath = ensureFolder(
                        join(dataset.path, "evaluation", this.config.subdir ?? "evaluation"),
                    );

                    // Evaluate the codebooks
                    const results = await evaluator.evaluate(
                        references.get(dataset.name) ?? {},
                        codes, gs, exportPath,
                    );

                    logger.info(`Writing evaluation results to ${exportPath}`);
                    writeFileSync(
                        `${exportPath}-${evaluator.name}.json`,
                        JSON.stringify(results, null, 4),
                    );
                },
            );
        }

        this.executed = true;
    }

    override async execute() {
        await super.execute();

        await logger.withSource(this._prefix, "execute", true, this.#execute.bind(this));
    }
}
