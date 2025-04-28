import { writeFileSync } from "fs";

import { consolidateCodebook, mergeCodebooks } from "../consolidating/codebooks.js";
import { PipelineConsolidator } from "../consolidating/consolidator.js";
import { DefinitionGenerator } from "../consolidating/definition-generator.js";
import { RefineMerger } from "../consolidating/refine-merger.js";
import { SimpleMerger } from "../consolidating/simple-merger.js";
import type { Codebook, CodedThreadsWithCodebook, Dataset } from "../schema.js";
import type { IDStrFunc } from "../steps/base-step.js";
import type { EmbedderObject } from "../utils/embeddings.js";
import { exportChunksForCoding } from "../utils/export.js";
import type { LLMSession } from "../utils/llms.js";
import { logger } from "../utils/logger.js";

interface ReferenceBuilderConfig {
    retries?: number;
    fakeRequest?: boolean;
}

/** A reference codebook builder. */
export abstract class ReferenceBuilder<TUnit> {
    /** The suffix of the reference codebook. */
    suffix = "";
    /** The base temperature for the reference builder. */
    baseTemperature = 0.5;

    /** The original codes in the reference codebook. */
    private originalCodes = new Set<string>();

    protected _idStr: IDStrFunc;

    constructor(
        idstr: IDStrFunc,
        /** The dataset the reference builder is working on. */
        public dataset: Dataset<TUnit[]>,
        /** The LLM session for the reference builder. */
        public session: LLMSession,
        /** The embedder object for the reference builder. */
        public embedder: EmbedderObject,
        public config?: ReferenceBuilderConfig,
    ) {
        this._idStr = (mtd?: string) => idstr(`ReferenceBuilder${mtd ? `#${mtd}` : ""}`);
    }

    /** Build a reference codebook from a list of codebooks. */
    async buildReference(codebooks: Codebook[]): Promise<Codebook> {
        const _id = this._idStr("buildReference");

        const lens = codebooks.map((c) => Object.keys(c).length);
        logger.info(`Merging ${codebooks.length} codebooks`, _id);
        logger.info(
            `${lens.reduce((Prev, Curr) => Curr + Prev)} codes found (${lens.join(", ")})`,
            _id,
        );
        // Remove alternatives from individual codebooks
        // Codebooks.forEach(Codebook => Object.values(Codebook).forEach(Code => Code.Alternatives = []));
        // Merge into a single codebook
        const merged = mergeCodebooks(codebooks);
        logger.success(`Got ${Object.keys(merged).length} codes after merging by name`, _id);
        const refined = await this.refineCodebook(merged);
        logger.success(`Got ${Object.keys(refined).length} codes after refining`, _id);
        return refined;
    }

    /** Further merge the codebook.*/
    protected async refineCodebook(codebook: Codebook): Promise<Codebook> {
        const _id = this._idStr("refineCodebook");

        const threads: CodedThreadsWithCodebook = { codebook, threads: {} };
        const consolidator = new PipelineConsolidator(this._idStr, this.dataset, this.session, [
            // Merge codes that have been merged
            // new AlternativeMerger(),
            // Merge very similar names
            new SimpleMerger(this._idStr, this.embedder, { looping: true }),
            // Generate definitions for missing ones
            new DefinitionGenerator(this._idStr, this.dataset),
        ]);
        consolidator.baseTemperature = this.baseTemperature;
        await consolidateCodebook(
            this._idStr,
            this.dataset,
            this.session,
            consolidator,
            [],
            threads,
            (iter) => this.sanityCheck(iter, threads.codebook),
        );
        logger.success(
            `${Object.keys(threads.codebook).length} codes remained after consolidation`,
            _id,
        );
        // Return the new codebook
        return threads.codebook;
    }

    /** Check if original codes are still present in the consolidated one. */
    protected sanityCheck(iter: number, codebook: Codebook) {
        const _id = this._idStr("sanityCheck");

        writeFileSync(`./known/codebook-${iter}.json`, JSON.stringify(codebook, null, 4), "utf8");
        if (iter === 0) {
            this.originalCodes = new Set<string>(Object.values(codebook).map((c) => c.label));
        } else {
            const newCodes = new Set<string>(
                Object.values(codebook).flatMap((c) => [c.label, ...(c.alternatives ?? [])]),
            );
            this.originalCodes.forEach((c) => {
                if (!newCodes.has(c)) {
                    logger.error(`Code ${c} disappeared in iteration ${iter}`, true, _id);
                }
            });
        }
        return Promise.resolve();
    }
}

export type RefiningReferenceBuilderConfig<TUnit> = ReferenceBuilderConfig &
    (
        | {
              baseTemperature?: number;
              sameData?: boolean;
              useVerbPhrases?: boolean;
          }
        | {
              consolidator: PipelineConsolidator<TUnit>;
          }
    );

/** A builder of reference codebook that further refines codes. */
export class RefiningReferenceBuilder<TUnit> extends ReferenceBuilder<TUnit> {
    /** The suffix of the reference codebook. */
    override suffix = "-refined";
    override baseTemperature = 0.5;

    /** Whether the codebooks refer to the same underlying data. */
    public sameData = true;
    /** Whether the merging process should force verb phrases. */
    public useVerbPhrases = false;
    public consolidator?: PipelineConsolidator<TUnit>;

    constructor(
        idstr: IDStrFunc,
        /** The dataset the reference builder is working on. */
        dataset: Dataset<TUnit[]>,
        /** The LLM session for the reference builder. */
        session: LLMSession,
        /** The embedder object for the reference builder. */
        embedder: EmbedderObject,
        config?: RefiningReferenceBuilderConfig<TUnit>,
    ) {
        super(idstr, dataset, session, embedder);
        if (config) {
            if ("consolidator" in config) {
                this.consolidator = config.consolidator;
            } else {
                this.baseTemperature = config.baseTemperature ?? this.baseTemperature;
                this.sameData = config.sameData ?? this.sameData;
                this.useVerbPhrases = config.useVerbPhrases ?? this.useVerbPhrases;
            }
        }
    }

    /** Further merge the codebook.*/
    protected override async refineCodebook(codebook: Codebook) {
        const _id = this._idStr("refineCodebook");

        const threads: CodedThreadsWithCodebook = { codebook, threads: {} };
        Object.values(codebook).forEach((Code) => (Code.alternatives = []));

        this.consolidator =
            this.consolidator ??
            new PipelineConsolidator(this._idStr, this.dataset, this.session, [
                // Merge codes that have been merged
                // new AlternativeMerger(),
                // Merge very similar names
                new SimpleMerger(this._idStr, this.embedder, { looping: true }),
                // Generate definitions for missing ones
                new DefinitionGenerator(this._idStr, this.dataset),
                // Merge definitions
                // Do not use penalty mechanism when the codebooks refer to different data
                // It may create a bias against smaller datasets
                // new RefineMerger({ Maximum: 0.5, Minimum: !this.SameData ? 0.5 : 0.4, UseDefinition: false, UseVerbPhrases: this.UseVerbPhrases }),
                new RefineMerger(this._idStr, this.dataset, this.embedder, {
                    maximum: 0.5,
                    minimum: !this.sameData ? 0.5 : 0.4,
                    useVerbPhrases: this.useVerbPhrases,
                    looping: true,
                }),
                // new RefineMerger({ Maximum: 0.6, Minimum: !this.SameData ? 0.6 : 0.4, UseDefinition: false, UseVerbPhrases: this.UseVerbPhrases }),
                new RefineMerger(this._idStr, this.dataset, this.embedder, {
                    maximum: 0.6,
                    minimum: !this.sameData ? 0.6 : 0.4,
                    useVerbPhrases: this.useVerbPhrases,
                    looping: true,
                }),
            ]);
        this.consolidator.baseTemperature = this.baseTemperature;
        await consolidateCodebook(
            this._idStr,
            this.dataset,
            this.session,
            this.consolidator,
            [],
            threads,
            (iter) => this.sanityCheck(iter, threads.codebook),
            undefined,
            this.config?.retries,
        );
        logger.success(
            `${Object.keys(threads.codebook).length} codes remained after consolidation`,
            _id,
        );
        // Return the new codebook
        return threads.codebook;
    }
}

/** Build a reference codebook and export it. */
export const buildReferenceAndExport = async <T>(
    idStr: IDStrFunc,
    builder: ReferenceBuilder<T>,
    codebooks: Codebook[],
    targetPath: string,
) => {
    const _id = idStr("buildReferenceAndExport");

    // Build the reference codebook
    const result = await builder.buildReference(codebooks);
    // Export it to JSON
    logger.info(`Exporting reference codebook to ${targetPath}`, _id);
    writeFileSync(`${targetPath}.json`, JSON.stringify(result, null, 4), "utf8");
    // Export it to Excel
    const book = exportChunksForCoding(idStr, [], { codebook: result, threads: {} });
    await book.xlsx.writeFile(`${targetPath}.xlsx`);
    return result;
};
