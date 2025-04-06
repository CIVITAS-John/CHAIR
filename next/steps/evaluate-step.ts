import { writeFileSync } from "fs";
import { join } from "path";

// import type { CodebookEvaluator } from "../evaluating/codebooks";
import { NetworkEvaluator } from "../evaluating/network-evaluator";
import type { Codebook, DataChunk, DataItem, Dataset } from "../schema";
import type { EmbedderObject } from "../utils/embeddings";
import { ensureFolder } from "../utils/file";
import { logger } from "../utils/logger";

import { BaseStep } from "./base-step";
import type { ConsolidateStep } from "./consolidate-step";

export interface EvaluateStepConfig<
    TUnit extends DataChunk<TSubunit>,
    TSubunit extends DataItem = DataItem,
> {
    // evaluator: new () => CodebookEvaluator;
    consolidator: ConsolidateStep<TUnit, TSubunit>;
    subdir?: string; // Defaults to "evaluation"
}

export class EvaluateStep<
    TUnit extends DataChunk<TSubunit>,
    TSubunit extends DataItem = DataItem,
> extends BaseStep {
    override dependsOn: ConsolidateStep<TUnit, TSubunit>[];

    embedder?: EmbedderObject;

    constructor(private readonly config: EvaluateStepConfig<TUnit, TSubunit>) {
        super();

        // If config.consolidator is not provided, we will evaluate all consolidators
        this.dependsOn = [config.consolidator];
    }

    override async execute() {
        await super.execute();
        const _id = this._idStr("execute");

        // Sanity check
        if (!this.embedder) {
            throw new EvaluateStep.ConfigError("Embedder not set", _id);
        }

        const datasets: Dataset<TUnit[]>[] = [],
            codebooks = new Map<string, Record<string, Codebook>>(),
            references = new Map<string, Codebook>();
        const consolidator = this.config.consolidator;
        consolidator.datasets.forEach((dataset) => {
            datasets.push(dataset);
            codebooks.set(dataset.name, consolidator.getCodebooks(dataset.name));
            references.set(dataset.name, consolidator.getReference(dataset.name));
        });

        for (const dataset of datasets.values()) {
            const evaluator = new NetworkEvaluator(this._idStr, this.embedder, {
                dataset: dataset as unknown as Dataset<TUnit>,
            });
            const codes = codebooks.get(dataset.name) ?? {};
            const exportPath = ensureFolder(
                join(dataset.path, "evaluation", this.config.subdir ?? "evaluation"),
            );
            // Evaluate the codebooks
            const results = await evaluator.evaluate(
                [references.get(dataset.name) ?? {}, ...Object.values(codes)],
                [join(dataset.path, "references"), ...Object.keys(codes)],
                exportPath,
            );

            logger.info(`Writing evaluation results to ${exportPath}`, _id);
            writeFileSync(`${exportPath}-${evaluator.name}.json`, JSON.stringify(results, null, 4));
        }

        this.executed = true;
    }
}
