import chalk from "chalk";
import { Codebook } from "../../utils/schema.js";
import { ConsolidateCodebook, MergeCodebooks } from "../codebooks/codebooks.js";
import { SimpleNameMerger } from '../codebooks/simple-name-merger.js';
import { PipelineConsolidator } from "../codebooks/consolidator.js";

/** BuildReference: Build a reference codebook from a list of codebooks. */
export async function BuildReference(Codebooks: Codebook[]): Promise<Codebook> {
    console.log(`Start merging ${Codebooks.length} codebooks into a reference codebook.`);
    // Merge into a single codebook
    var Codebook = MergeCodebooks(Codebooks);
    console.log(chalk.green(`Statistics: ${Object.keys(Codebook).length} codes emerged after merging by name alone.`));
    // Consolidate the codebook
    var Threads = { Codebook: Codebook, Threads: {} };
    ConsolidateCodebook<void>(new PipelineConsolidator(
        // Merge very similar names
        new SimpleNameMerger()
    ), [], Threads);
    // Return the new codebook
    return Threads.Codebook;
}
