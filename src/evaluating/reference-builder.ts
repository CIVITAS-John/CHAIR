import { writeFileSync } from "fs";

import { consolidateCodebook, mergeCodebooks } from "../consolidating/codebooks.js";
import type { CodeConsolidator } from "../consolidating/consolidator.js";
import { PipelineConsolidator } from "../consolidating/consolidator.js";
import { DefinitionGenerator } from "../consolidating/definition-generator.js";
import { RefineMerger } from "../consolidating/refine-merger.js";
import { SimpleMerger } from "../consolidating/simple-merger.js";
import type { Codebook, CodedThreadsWithCodebook } from "../schema.js";
import { exportChunksForCoding } from "../utils/io/export.js";
import { ensureFolder } from "../utils/io/file.js";
import { logger } from "../utils/core/logger.js";

export interface ReferenceBuilderConfig {
    retries?: number;
    fakeRequest?: boolean;
}

/** A reference codebook builder. */
export abstract class ReferenceBuilder {
    /** The suffix of the reference codebook. */
    suffix = "";
    /** The base temperature for the reference builder. */
    baseTemperature = 0.5;

    /** The original codes in the reference codebook. */
    private originalCodes = new Set<string>();

    protected _prefix: string;

    constructor(public config?: ReferenceBuilderConfig) {
        this._prefix = logger.prefixed(logger.prefix, "ReferenceBuilder");
    }

    /** Build a reference codebook from a list of codebooks. */
    buildReference(codebooks: Codebook[]): Promise<Codebook> {
        return logger.withSource(this._prefix, "buildReference", async () => {
            const lens = codebooks.map((c) => Object.keys(c).length);
            logger.info(`Merging ${codebooks.length} codebooks`);
            logger.info(
                `${lens.reduce((Prev, Curr) => Curr + Prev)} codes found (${lens.join(", ")})`,
            );
            // Remove alternatives from individual codebooks
            // Codebooks.forEach(Codebook => Object.values(Codebook).forEach(Code => Code.Alternatives = []));
            // Merge into a single codebook
            const merged = mergeCodebooks(codebooks);
            logger.success(`Got ${Object.keys(merged).length} codes after merging by name`);
            const refined = await this.refineCodebook(merged);
            logger.success(`Got ${Object.keys(refined).length} codes after refining`);
            return refined;
        });
    }

    /** Further merge the codebook.*/
    protected refineCodebook(codebook: Codebook): Promise<Codebook> {
        return logger.withSource(this._prefix, "refineCodebook", async () => {
            const threads: CodedThreadsWithCodebook = { codebook, threads: {} };
            const consolidator = new PipelineConsolidator([
                // Merge codes that have been merged
                // new AlternativeMerger(),
                // Merge very similar names
                new SimpleMerger({ looping: true }),
                // Generate definitions for missing ones
                new DefinitionGenerator(),
            ]);
            consolidator.baseTemperature = this.baseTemperature;
            await consolidateCodebook(consolidator, [], threads, (iter) => {
                return this.sanityCheck(iter, threads.codebook);
            });
            logger.success(
                `${Object.keys(threads.codebook).length} codes remained after consolidation`,
            );
            // Return the new codebook
            return threads.codebook;
        });
    }

    /** Check if original codes are still present in the consolidated one. */
    protected sanityCheck(iter: number, codebook: Codebook) {
        return logger.withSource(this._prefix, "sanityCheck", () => {
            ensureFolder("./known");
            writeFileSync(
                `./known/codebook-${iter}.json`,
                JSON.stringify(codebook, null, 4),
                "utf8",
            );
            if (iter === 0) {
                this.originalCodes = new Set<string>(Object.values(codebook).map((c) => c.label));
            } else {
                const newCodes = new Set<string>(
                    Object.values(codebook).flatMap((c) => [c.label, ...(c.alternatives ?? [])]),
                );
                this.originalCodes.forEach((c) => {
                    if (!newCodes.has(c)) {
                        logger.error(`Code ${c} disappeared in iteration ${iter}`, true);
                    }
                });
            }
            return Promise.resolve();
        });
    }
}

export type RefiningReferenceBuilderConfig = ReferenceBuilderConfig &
    (
        | {
              baseTemperature?: number;
              sameData?: boolean;
              useVerbPhrases?: boolean;
          }
        | {
              consolidators: CodeConsolidator[];
          }
    );

/** A builder of reference codebook that further refines codes. */
export class RefiningReferenceBuilder extends ReferenceBuilder {
    /** The suffix of the reference codebook. */
    override suffix = "-refined";
    override baseTemperature = 0.5;

    /** Whether the codebooks refer to the same underlying data. */
    public sameData = true;
    /** Whether the merging process should force verb phrases. */
    public useVerbPhrases = false;
    public consolidators?: CodeConsolidator[];

    constructor(config?: RefiningReferenceBuilderConfig) {
        super();
        if (config) {
            if ("consolidators" in config) {
                this.consolidators = config.consolidators;
            } else {
                this.baseTemperature = config.baseTemperature ?? this.baseTemperature;
                this.sameData = config.sameData ?? this.sameData;
                this.useVerbPhrases = config.useVerbPhrases ?? this.useVerbPhrases;
            }
        }
    }

    /** Further merge the codebook.*/
    protected override refineCodebook(codebook: Codebook) {
        return logger.withSource(this._prefix, "refineCodebook", async () => {
            const threads: CodedThreadsWithCodebook = { codebook, threads: {} };
            Object.values(codebook).forEach((Code) => (Code.alternatives = []));

            const consolidator = new PipelineConsolidator(
                this.consolidators ?? [
                    // Merge codes that have been merged
                    // new AlternativeMerger(),
                    // Merge very similar names
                    new SimpleMerger({ looping: true }),
                    // Generate definitions for missing ones
                    new DefinitionGenerator(),
                    // Merge definitions
                    // Do not use penalty mechanism when the codebooks refer to different data
                    // It may create a bias against smaller datasets
                    // new RefineMerger({ Maximum: 0.5, Minimum: !this.SameData ? 0.5 : 0.4, UseDefinition: false, UseVerbPhrases: this.UseVerbPhrases }),
                    new RefineMerger({
                        maximum: 0.5,
                        minimum: !this.sameData ? 0.5 : 0.4,
                        useVerbPhrases: this.useVerbPhrases,
                        looping: true,
                    }),
                    // new RefineMerger({ Maximum: 0.6, Minimum: !this.SameData ? 0.6 : 0.4, UseDefinition: false, UseVerbPhrases: this.UseVerbPhrases }),
                    new RefineMerger({
                        maximum: 0.6,
                        minimum: !this.sameData ? 0.6 : 0.4,
                        useVerbPhrases: this.useVerbPhrases,
                        looping: true,
                    }),
                ],
            );
            consolidator.baseTemperature = this.baseTemperature;
            await consolidateCodebook(
                consolidator,
                [],
                threads,
                (iter) => {
                    return this.sanityCheck(iter, threads.codebook);
                },
                undefined,
                this.config?.retries,
            );
            logger.success(
                `${Object.keys(threads.codebook).length} codes remained after consolidation`,
            );
            // Return the new codebook
            return threads.codebook;
        });
    }
}

/** Build a reference codebook and export it. */
export const buildReferenceAndExport = (
    builder: ReferenceBuilder,
    codebooks: Codebook[],
    targetPath: string,
) =>
    logger.withDefaultSource("buildReferenceAndExport", async () => {
        // Build the reference codebook
        const result = await builder.buildReference(codebooks);
        // Export it to JSON
        logger.info(`Exporting reference codebook to ${targetPath}`);
        writeFileSync(`${targetPath}.json`, JSON.stringify(result, null, 4), "utf8");
        // Export it to Excel
        const book = exportChunksForCoding([], { codebook: result, threads: {} });
        await book.xlsx.writeFile(`${targetPath}.xlsx`);
        return result;
    });
