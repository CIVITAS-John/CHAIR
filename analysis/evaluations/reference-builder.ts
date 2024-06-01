import * as File from 'fs';
import chalk from "chalk";
import { Codebook } from "../../utils/schema.js";
import { ConsolidateCodebook, MergeCodebooks } from "../codebooks/codebooks.js";
import { SimpleMerger } from '../codebooks/simple-merger.js';
import { PipelineConsolidator } from "../codebooks/consolidator.js";
import { ExportChunksForCoding } from "../../utils/export.js";
import { RefineMerger } from '../codebooks/refine-merger.js';
import { DefinitionGenerator } from '../codebooks/definition-generator.js';
import { AlternativeMerger } from '../codebooks/alternative-merger.js';

/** ReferenceBuilder: A builder of reference codebook. */
export class ReferenceBuilder {
    /** Suffix: The suffix of the reference codebook. */
    public Suffix: string = "";
    /** OriginalCodes: The original codes in the reference codebook. */
    private OriginalCodes = new Set<string>();
    /** BuildReference: Build a reference codebook from a list of codebooks. */
    public async BuildReference(Codebooks: Codebook[]): Promise<Codebook> {
        var Statistics = Codebooks.map(Codebook => Object.keys(Codebook).length);
        console.log(`Start merging ${Codebooks.length} codebooks into a reference codebook.`);
        console.log(chalk.green(`Statistics: ${Statistics.reduce((Prev, Curr) => Curr + Prev)} codes found (${Statistics.join(", ")}).`));
        // Remove alternatives from individual codebooks
        // Codebooks.forEach(Codebook => Object.values(Codebook).forEach(Code => Code.Alternatives = []));
        // Merge into a single codebook
        var Codebook = MergeCodebooks(Codebooks);
        console.log(chalk.green(`Statistics: ${Object.keys(Codebook).length} codes emerged after merging by name alone.`));
        return await this.RefineCodebook(Codebook);
    }
    /** RefineCodebook: Further merge the codebook.*/
    protected async RefineCodebook(Codebook: Codebook): Promise<Codebook> {
        var Threads = { Codebook: Codebook, Threads: {} };;
        await ConsolidateCodebook<void>(new PipelineConsolidator(
            // Merge codes that have been merged
            // new AlternativeMerger(),
            // Merge very similar names
            new SimpleMerger({ Looping: true }),
            // Merge similar definitions too
            new SimpleMerger({ Looping: true, UseDefinition: true, Maximum: 0.4 }),
        ), [], Threads, (Iteration) => this.SanityCheck(Iteration, Threads.Codebook));
        console.log(chalk.green(`Statistics: ${Object.keys(Threads.Codebook).length} codes remained after consolidation.`));
        // Return the new codebook
        return Threads.Codebook;
    }
    /** SanityCheck: Check if original codes are still present in the consolidated one. */
    protected async SanityCheck(Iteration: number, Codebook: Codebook) {
        File.writeFileSync(`./known/codebook-${Iteration}.json`, JSON.stringify(Codebook, null, 4), 'utf8');
        if (Iteration == 0) {
            this.OriginalCodes = new Set<string>(Object.values(Codebook).map(Code => Code.Label))
        } else {
            var NewCodes = new Set<string>(Object.values(Codebook).flatMap(Code => [Code.Label, ...Code.Alternatives ?? []]));
            this.OriginalCodes.forEach(Code => {
                if (!NewCodes.has(Code))
                    console.log(chalk.red(`Error: Code ${Code} disappeared in iteration ${Iteration}.`));
            });
        }
    }
}

/** RefiningReferenceBuilder: A builder of reference codebook that further refines codes. */
export class RefiningReferenceBuilder extends ReferenceBuilder {
    /** Suffix: The suffix of the reference codebook. */
    public Suffix: string = "-refined";
    /** SameData: Whether the codebooks refer to the same underlying data. */
    public SameData: boolean;
    /** Constructor: Initialize the reference builder. */
    public constructor(SameData: boolean = true) {
        super();
        this.SameData = SameData;
    }
    /** RefineCodebook: Further merge the codebook.*/
    protected async RefineCodebook(Codebook: Codebook): Promise<Codebook> {
        var Threads = { Codebook: Codebook, Threads: {} };
        Object.values(Codebook).forEach(Code => Code.Alternatives = []);
        await ConsolidateCodebook<void>(new PipelineConsolidator(
            // Merge codes that have been merged
            // new AlternativeMerger(),
            // Merge very similar names
            new SimpleMerger({ Looping: true }),
            // Generate definitions for missing ones
            new DefinitionGenerator(),
            // Merge definitions
            // Do not use penalty mechanism when the codebooks refer to different data
            // It may create a bias against smaller datasets
            new RefineMerger({ Maximum: 0.5, Minimum: !this.SameData ? 0.5 : 0.45, UseDefinition: false }),
            new RefineMerger({ Maximum: 0.5, Minimum: !this.SameData ? 0.5 : 0.45, Looping: true }),
            new RefineMerger({ Maximum: 0.65, Minimum: !this.SameData ? 0.6 : 0.4, UseDefinition: false }),
            new RefineMerger({ Maximum: 0.65, Minimum: !this.SameData ? 0.6 : 0.4, Looping: true }),
        ), [], Threads, (Iteration) => this.SanityCheck(Iteration, Threads.Codebook));
        console.log(chalk.green(`Statistics: ${Object.keys(Threads.Codebook).length} codes remained after consolidation.`));
        // Return the new codebook
        return Threads.Codebook;
    }
}

/** BuildReference: Build a reference codebook and export it. */
export async function BuildReferenceAndExport(Builder: ReferenceBuilder, Codebooks: Codebook[], TargetPath: string): Promise<Codebook> {
    // Build the reference codebook
    var Result = await Builder.BuildReference(Codebooks);
    // Export it to JSON
    console.log(chalk.green(`Exporting the reference codebook to ${TargetPath}.`));
    File.writeFileSync(TargetPath + ".json", JSON.stringify(Result, null, 4), 'utf8');
    // Export it to Excel
    var Book = ExportChunksForCoding([], { Codebook: Result, Threads: {} });
    await Book.xlsx.writeFile(TargetPath + ".xlsx");
    return Result;
}