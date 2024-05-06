import * as File from 'fs';
import chalk from "chalk";
import { Codebook } from "../../utils/schema.js";
import { ConsolidateCodebook, MergeCodebooks } from "../codebooks/codebooks.js";
import { SimpleMerger } from '../codebooks/simple-merger.js';
import { PipelineConsolidator } from "../codebooks/consolidator.js";
import { ExportConversationsForCoding } from "../../utils/export.js";

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

/** BuildReference: Build a reference codebook and export it. */
export async function BuildReferenceAndExport(Codebooks: Codebook[], TargetPath: string): Promise<Codebook> {
    // Build the reference codebook
    var Result = await BuildReference(Codebooks);
    // Export it to JSON
    console.log(chalk.green(`Exporting the reference codebook to ${TargetPath}.`));
    File.writeFileSync(TargetPath + ".json", JSON.stringify(Result, null, 4), 'utf8');
    // Export it to Excel
    var Book = ExportConversationsForCoding([], { Codebook: Result, Threads: {} });
    await Book.xlsx.writeFile(TargetPath + ".xlsx");
    return Result;
}