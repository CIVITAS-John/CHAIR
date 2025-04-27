import { join } from "path";

import md5 from "md5";

import type { ReferenceBuilderConfig } from "../evaluating/reference-builder.js";
import {
    buildReferenceAndExport,
    RefiningReferenceBuilder,
} from "../evaluating/reference-builder.js";
import type { Codebook, DataChunk, DataItem, Dataset } from "../schema.js";
import type { EmbedderObject } from "../utils/embeddings.js";
import { ensureFolder, withCache } from "../utils/file.js";
import { type LLMModel, useLLMs } from "../utils/llms.js";

import type { AIParameters } from "./base-step.js";
import { BaseStep } from "./base-step.js";
import type { CodeStep } from "./code-step.js";

export interface ConsolidateStepConfig<
    TSubunit extends DataItem = DataItem,
    TUnit extends DataChunk<TSubunit> = DataChunk<TSubunit>,
> {
    coder?: CodeStep<TSubunit, TUnit> | CodeStep<TSubunit, TUnit>[]; // Defaults to all coders
    // strategy: ConsolidateStrategy;
    model: LLMModel | LLMModel[];
    parameters?: AIParameters;
    builderConfig?: ReferenceBuilderConfig<TUnit>;
}

export class ConsolidateStep<
    TSubunit extends DataItem = DataItem,
    TUnit extends DataChunk<TSubunit> = DataChunk<TSubunit>,
> extends BaseStep {
    override dependsOn: CodeStep<TSubunit, TUnit>[];

    embedder?: EmbedderObject;

    #datasets: Dataset<TUnit[]>[] = [];
    get datasets() {
        // Sanity check
        if (!this.executed || !this.#datasets.length) {
            throw new ConsolidateStep.UnexecutedError(this._idStr("datasets"));
        }
        return this.#datasets;
    }

    #codebooks = new Map<string, Record<string, Codebook>>();
    getCodebooks(dataset: string) {
        const _id = this._idStr("getCodebooks");

        // Sanity check
        if (!this.executed || !this.#codebooks.size) {
            throw new ConsolidateStep.UnexecutedError(this._idStr("codebooks"));
        }
        if (!this.#codebooks.has(dataset)) {
            throw new ConsolidateStep.InternalError(`Dataset ${dataset} not found`, _id);
        }

        return this.#codebooks.get(dataset) ?? {};
    }

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

    constructor(private readonly config: ConsolidateStepConfig<TSubunit, TUnit>) {
        super();

        // If config.coder is not provided, we will consolidate all codes
        this.dependsOn = config.coder
            ? Array.isArray(config.coder)
                ? config.coder
                : [config.coder]
            : [];
    }

    override async execute() {
        const _id = this._idStr("execute");
        await super.execute();

        const datasets = new Map<string, Dataset<TUnit[]>>();
        this.dependsOn.forEach((coder) => {
            coder.datasets.forEach((dataset) => {
                const results = coder.getResult(dataset.name);
                if (!datasets.has(dataset.name)) {
                    datasets.set(dataset.name, dataset as unknown as Dataset<TUnit[]>);
                }

                this.#codebooks.set(dataset.name, {
                    ...(this.#codebooks.get(dataset.name) ?? {}),
                    ...Object.entries(results).reduce<Record<string, Codebook>>(
                        (acc, [analyzer, result]) => {
                            Object.entries(result).forEach(([ident, codedThreads]) => {
                                const key = `${analyzer}-${ident}`;
                                if (!codedThreads.codebook) {
                                    throw new ConsolidateStep.InternalError(
                                        `Codebook not found in ${key}`,
                                        _id,
                                    );
                                }
                                acc[key] = codedThreads.codebook;
                            });
                            return acc;
                        },
                        {},
                    ),
                });
            });
        });
        this.#datasets = [...datasets.values()];

        const models = Array.isArray(this.config.model) ? this.config.model : [this.config.model];

        await useLLMs(
            this._idStr,
            async (session) => {
                // Sanity check
                if (!this.embedder) {
                    throw new ConsolidateStep.ConfigError("Embedder not set", _id);
                }

                for (const dataset of this.#datasets) {
                    const codes = Object.values(this.#codebooks.get(dataset.name) ?? {});
                    const builder = new RefiningReferenceBuilder(
                        this._idStr,
                        dataset,
                        session,
                        this.embedder,
                        this.config.builderConfig,
                    );
                    const referencePath = ensureFolder(
                        join(
                            dataset.path,
                            "references",
                            // `${Analyzers.join("-")}_
                            `${models.map((m) => (typeof m === "string" ? m : m.name)).join("-")}${builder.suffix}`,
                        ),
                    );
                    const hash = md5(JSON.stringify(codes));
                    const reference = await withCache(this._idStr, referencePath, hash, () =>
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
