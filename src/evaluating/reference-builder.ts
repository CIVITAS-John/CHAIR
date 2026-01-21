/**
 * Reference Codebook Building
 *
 * This module provides tools for building reference codebooks from multiple
 * individual codebooks. Reference codebooks serve as consolidated baselines
 * for evaluation and comparison.
 *
 * The reference building process:
 * 1. Merges codes from multiple codebooks by name
 * 2. Consolidates similar codes using various strategies
 * 3. Generates definitions for codes missing them
 * 4. Refines the codebook through iterative merging
 * 5. Validates that original codes are preserved
 * 6. Exports the reference codebook to JSON and Excel formats
 *
 * Different building strategies:
 * - ReferenceBuilder: Basic merging with simple consolidation
 * - RefiningReferenceBuilder: Advanced merging with similarity-based refinement
 */

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

/**
 * Configuration for reference codebook builders.
 */
export interface ReferenceBuilderConfig {
    /** Number of retries for failed consolidation steps. */
    retries?: number;
    /** Whether to use fake/mock requests for testing. */
    fakeRequest?: boolean;
}

/**
 * Abstract base class for reference codebook builders.
 *
 * Reference builders create a consolidated baseline codebook from multiple
 * individual codebooks. This baseline is used for evaluation and comparison.
 */
export abstract class ReferenceBuilder {
    /** Filename suffix for the reference codebook (e.g., "-refined"). */
    suffix = "";

    /** Base temperature for AI-based consolidation operations (0-1). */
    baseTemperature = 0.5;

    /**
     * Tracks original codes to ensure they aren't lost during consolidation.
     * Used by sanity check to validate consolidation integrity.
     */
    private originalCodes = new Set<string>();

    /** Logger prefix for this builder. */
    protected _prefix: string;

    /**
     * Creates a reference builder with optional configuration.
     *
     * @param config - Configuration for retries and testing
     */
    constructor(public config?: ReferenceBuilderConfig) {
        this._prefix = logger.prefixed(logger.prefix, "ReferenceBuilder");
    }

    /**
     * Builds a reference codebook from multiple codebooks.
     *
     * Process:
     * 1. Merges codes by name across all codebooks
     * 2. Refines the merged codebook using consolidation strategies
     * 3. Returns the consolidated reference codebook
     *
     * @param codebooks - Array of codebooks to merge
     * @returns Promise resolving to the merged and refined codebook
     */
    buildReference(codebooks: Codebook[]): Promise<Codebook> {
        return logger.withSource(this._prefix, "buildReference", async () => {
            const lens = codebooks.map((c) => Object.keys(c).length);
            logger.info(`Merging ${codebooks.length} codebooks`);
            if (codebooks.length == 1) return codebooks[0];
            logger.info(
                `${lens.reduce((Prev, Curr) => Curr + Prev)} codes found (${lens.join(", ")})`,
            );
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
            // If consolidators is explicitly set to empty array, skip consolidation
            if (this.consolidators && this.consolidators.length === 0) {
                logger.info("No consolidators configured - returning merged codebook without further consolidation");
                return codebook;
            }

            const threads: CodedThreadsWithCodebook = { codebook, threads: {} };
            Object.values(codebook).forEach((Code) => (Code.alternatives = []));

            // Use provided consolidators if available, otherwise use defaults
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
