import { join } from "path";

import md5 from "md5";

import { buildReferenceAndExport, RefiningReferenceBuilder } from "../evaluating/reference-builder";
import type { Codebook, DataChunk, DataItem, Dataset } from "../schema";
import { type EmbedderModel, initEmbedder } from "../utils/embeddings";
import { cachedTask, ensureFolder } from "../utils/file";
import { type LLMModel, useLLMs } from "../utils/llms";

import type { AIParameters } from "./base-step";
import { BaseStep } from "./base-step";
import type { CodeStep } from "./code-step";

export interface ConsolidateStepConfig<
    TUnit extends DataChunk<TSubunit>,
    TSubunit extends DataItem = DataItem,
> {
    coder?: CodeStep<TUnit, TSubunit> | CodeStep<TUnit, TSubunit>[]; // Defaults to all coders
    // strategy: ConsolidateStrategy;
    model: LLMModel | LLMModel[];
    embedder: EmbedderModel;
    parameters?: AIParameters;
}

export class ConsolidateStep<
    TUnit extends DataChunk<TSubunit>,
    TSubunit extends DataItem = DataItem,
> extends BaseStep {
    override _type = "Consolidate";
    override dependsOn: CodeStep<TUnit, TSubunit>[];

    #references = new Map<string, Codebook>();
    getReference(dataset: string) {
        const _id = this._idStr("getReference");

        // Sanity check
        if (!this.executed || !this.#references.size) {
            throw new ConsolidateStep.UnexecutedError(_id);
        }
        if (!this.#references.has(dataset)) {
            throw new ConsolidateStep.InternalError(`Dataset ${dataset} not found`, _id);
        }

        return this.#references.get(dataset) ?? {};
    }

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
        const _id = this._idStr("execute");

        const datasets = new Map<
            string,
            {
                dataset: Dataset<TUnit[]>;
                codes: Codebook[];
            }
        >();
        this.dependsOn.forEach((coder) => {
            coder.datasets.forEach((dataset) => {
                const results = coder.getResult(dataset.name);
                datasets.set(dataset.name, {
                    dataset: dataset as unknown as Dataset<TUnit[]>,
                    codes: [
                        ...(datasets.get(dataset.name)?.codes ?? []),
                        ...Object.entries(results).flatMap(([analyzer, result]) =>
                            Object.entries(result).map(([ident, r]) => {
                                if (!r.codebook) {
                                    throw new ConsolidateStep.ConfigError(
                                        `Codebook not found for ${analyzer}/${ident}`,
                                        _id,
                                    );
                                }
                                return r.codebook;
                            }),
                        ),
                    ],
                });
            });
        });

        const embedder =
            typeof this.config.embedder === "string"
                ? initEmbedder(this.config.embedder)
                : this.config.embedder;
        const models = Array.isArray(this.config.model) ? this.config.model : [this.config.model];

        await useLLMs(
            this._idStr,
            async (session) => {
                for (const { dataset, codes } of datasets.values()) {
                    const builder = new RefiningReferenceBuilder(
                        this._idStr,
                        dataset,
                        session,
                        embedder,
                    );
                    const referencePath = ensureFolder(join(dataset.path, "references"));
                    const hash = md5(JSON.stringify(codes));
                    const reference = await cachedTask(this._idStr, referencePath, hash, () =>
                        buildReferenceAndExport(this._idStr, builder, codes, referencePath),
                    );
                    this.#references.set(dataset.name, reference);
                }
            },
            models,
        );

        this.executed = true;
    }
}
