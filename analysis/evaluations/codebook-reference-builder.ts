import chalk from "chalk";
import { Codebook } from "../../utils/schema.js";
import { ConsolidateCodebook, MergeCodebooks } from "../codebooks/codebooks.js";
import { SimpleMerger } from '../codebooks/simple-merger.js';
import { PipelineConsolidator } from "../codebooks/consolidator.js";

/** BuildReference: Build a reference codebook from a list of codebooks. */
export async function BuildReference(Codebooks: Codebook[]): Promise<Codebook> {
    var Statistics = Codebooks.map(Codebook => Object.keys(Codebook).length);
    console.log(`Start merging ${Codebooks.length} codebooks into a reference codebook.`);
    console.log(chalk.green(`Statistics: ${Statistics.reduce((Prev, Curr) => Curr + Prev)} codes found (${Statistics.join(", ")}).`));
    // Remove alternatives from individual codebooks
    Codebooks.forEach(Codebook => Object.values(Codebook).forEach(Code => Code.Alternatives = []));
    // Merge into a single codebook
    var Codebook = MergeCodebooks(Codebooks);
    console.log(chalk.green(`Statistics: ${Object.keys(Codebook).length} codes emerged after merging by name alone.`));
    // Consolidate the codebook
    var Threads = { Codebook: Codebook, Threads: {} };
    await ConsolidateCodebook<void>(new PipelineConsolidator(
        // Merge very similar names
        new SimpleMerger({ Looping: true }),
        // Merge similar definitions too
        new SimpleMerger({ Looping: true, UseDefinition: true, Threshold: 0.4 }),
    ), [], Threads);
    console.log(chalk.green(`Statistics: ${Object.keys(Threads.Codebook).length} codes remained after consolidation.`));
    // Return the new codebook
    return Threads.Codebook;
}
