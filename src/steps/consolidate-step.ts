import { join } from "path";

import md5 from "md5";

import { mergeCodebooks } from "../consolidating/codebooks.js";
import type { RefiningReferenceBuilderConfig } from "../evaluating/reference-builder.js";
import {
    buildReferenceAndExport,
    RefiningReferenceBuilder,
} from "../evaluating/reference-builder.js";
import type { Codebook, DataChunk, DataItem, Dataset } from "../schema.js";
import { withCache } from "../utils/cache.js";
import { ensureFolder } from "../utils/file.js";
import { type LLMModel, useLLMs } from "../utils/llms.js";
import { logger } from "../utils/logger.js";

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
    builderConfig?: RefiningReferenceBuilderConfig;
    namePattern?: string; // Pattern for the codebook names
    prefix?: string; // Prefix for the reference files
}

export class ConsolidateStep<
    TSubunit extends DataItem = DataItem,
    TUnit extends DataChunk<TSubunit> = DataChunk<TSubunit>,
> extends BaseStep {
    override dependsOn: CodeStep<TSubunit, TUnit>[];

    #datasets: Dataset<TUnit[]>[] = [];
    get datasets() {
        // Sanity check
        if (!this.executed || !this.#datasets.length) {
            throw new ConsolidateStep.UnexecutedError(logger.prefixed(this._prefix, "datasets"));
        }
        return this.#datasets;
    }

    #codebooks = new Map<string, Record<string, Codebook>>();
    getCodebooks(dataset: string) {
        logger.withSource(this._prefix, "getCodebooks", () => {
            // Sanity check
            if (!this.executed || !this.#codebooks.size) {
                throw new ConsolidateStep.UnexecutedError();
            }
            if (!this.#codebooks.has(dataset)) {
                throw new ConsolidateStep.InternalError(`Dataset ${dataset} not found`);
            }
        });

        return this.#codebooks.get(dataset) ?? {};
    }

    #groups = new Map<string, Record<string, [Codebook, string[]]>>();
    getGroups(dataset: string) {
        logger.withSource(this._prefix, "getGroups", () => {
            // Sanity check
            if (!this.executed || !this.#groups.size) {
                throw new ConsolidateStep.UnexecutedError();
            }
            if (!this.#groups.has(dataset)) {
                throw new ConsolidateStep.InternalError(`Dataset ${dataset} not found`);
            }
        });

        return this.#groups.get(dataset) ?? {};
    }

    #references = new Map<string, Codebook>();
    getReference(dataset: string) {
        logger.withSource(this._prefix, "getReference", () => {
            // Sanity check
            if (!this.executed || !this.#references.size) {
                throw new ConsolidateStep.UnexecutedError();
            }
            if (!this.#references.has(dataset)) {
                throw new ConsolidateStep.InternalError(`Dataset ${dataset} not found`);
            }
        });

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

    async #_execute() {
        const datasets = new Map<string, Dataset<TUnit[]>>();
        this.dependsOn.forEach((coder) => {
            coder.datasets.forEach((dataset) => {
                const results = coder.getResult(dataset.name);
                if (!datasets.has(dataset.name)) {
                    datasets.set(dataset.name, dataset as unknown as Dataset<TUnit[]>);
                }

                const codebooks: Codebook[] = [];
                const names: string[] = [];
                // Put the codebooks into the map
                this.#codebooks.set(dataset.name, {
                    ...(this.#codebooks.get(dataset.name) ?? {}),
                    ...Object.entries(results).reduce<Record<string, Codebook>>(
                        (acc, [analyzer, result]) => {
                            Object.entries(result).forEach(([ident, codedThreads]) => {
                                var key = `${analyzer}-${ident}`;
                                if (this.config.namePattern) {
                                    key = this.config.namePattern
                                        .replace("{dataset}", dataset.name)
                                        .replace("{analyzer}", analyzer)
                                        .replace("{coder}", ident)
                                        .replace("{coder-human}", coder.group == "human" ? ident : "ai");
                                }
                                if (!codedThreads.codebook) {
                                    throw new ConsolidateStep.InternalError(
                                        `Codebook not found in ${key}`,
                                    );
                                }
                                acc[key] = codedThreads.codebook;
                                codebooks.push(codedThreads.codebook);
                                names.push(key);
                            });
                            return acc;
                        },
                        {},
                    ),
                });
                // Put the group codebooks into the map, if more than one codebook is present
                if (!this.#groups.has(dataset.name)) {
                    this.#groups.set(dataset.name, {});
                }
                if (codebooks.length > 1) {
                    const group = mergeCodebooks(codebooks);
                    const prev = this.#groups.get(dataset.name) ?? {};
                    this.#groups.set(dataset.name, { ...prev, [coder.group]: [group, names] });
                }
            });
        });
        this.#datasets = [...datasets.values()];

        const models = Array.isArray(this.config.model) ? this.config.model : [this.config.model];

        await useLLMs(async (session) => {
            for (const dataset of this.#datasets) {
                await BaseStep.Context.with(
                    {
                        dataset,
                        session,
                    },
                    async () => {
                        // We made a deep copy here because the reference builder may modify the codebooks
                        const codes = JSON.stringify(
                            Object.values(this.#codebooks.get(dataset.name) ?? {}),
                        );
                        const builder = new RefiningReferenceBuilder(this.config.builderConfig);
                        const referencePath = ensureFolder(
                            join(
                                dataset.path,
                                "references",
                                `${this.config.prefix ? this.config.prefix + "-" : ""}${models.map((m) => (typeof m === "string" ? m : m.name)).join("-")}${builder.suffix}`,
                            ),
                        );
                        const hash = md5(codes);
                        const reference = await withCache(referencePath, hash, () =>
                            buildReferenceAndExport(
                                builder,
                                JSON.parse(codes) as Codebook[],
                                referencePath,
                            ),
                        );
                        this.#references.set(dataset.name, reference);
                    },
                );
            }
        }, models);

        this.executed = true;
    }

    override async execute() {
        await super.execute();

        await logger.withSource(this._prefix, "execute", true, this.#_execute.bind(this));
    }
}
