import chalk from "chalk";
import md5 from "md5";
import { Codebook, CodebookEvaluation } from "../utils/schema.js";
import { ReadOrBuildCache, RemoveCommonality } from "../utils/file.js";
import { BuildReferenceAndExport, ReferenceBuilder } from "./reference-builder.js";
import { LoadCodebooks, LoadCodebooksInGroups } from "../utils/loader.js";
import * as Path from "path";

/** CodebookEvaluator: An evaluator of codebook. */
export abstract class CodebookEvaluator {
    /** Name: The name of the evaluator. */
    public Name: string = "Unnamed";
    /** Evaluate: Evaluate a number of codebooks. */
    public abstract Evaluate(Codebooks: Codebook[], Names: string[], ExportPath?: string): Promise<Record<string, CodebookEvaluation>>;
}

/** EvaluateCodebooksWithReference: Evaluate a number of codebooks. */
export async function EvaluateCodebooksWithReference(
    Source: string | string[],
    Evaluator: CodebookEvaluator,
    ExportPath?: string,
): Promise<Record<string, CodebookEvaluation>> {
    // Find all the codebooks under the path
    var [Codebooks, Names] = await LoadCodebooks(Source);
    // Evaluate the codebooks
    var Results = await Evaluator.Evaluate(Codebooks, Names, ExportPath);
    console.log(chalk.green(JSON.stringify(Results, null, 4)));
    return Results;
}

/** BuildReferenceAndEvaluateCodebooks: Build a reference and evaluate a number of codebooks. */
export async function BuildReferenceAndEvaluateCodebooks(
    Source: string | string[],
    ReferencePath: string,
    Builder: ReferenceBuilder,
    Evaluator: CodebookEvaluator,
    ExportPath?: string,
    CreateGroup?: boolean,
): Promise<Record<string, CodebookEvaluation>> {
    // Find all the codebooks under the path
    var [Codebooks, Names] = await LoadCodebooks(Source, CreateGroup);
    // Remove commonality from multiple codebooks
    if (Names.length == 1) Names = [Path.basename(Names[0])];
    else Names = RemoveCommonality(Names);
    // Build the reference codebook
    var RealCodebooks = Codebooks.filter((_, I) => Names[I].startsWith("group: ") == false);
    var Backup = JSON.stringify(RealCodebooks);
    var Hash = md5(Backup);
    var Reference = await ReadOrBuildCache(ReferencePath, Hash, () => BuildReferenceAndExport(Builder, JSON.parse(Backup), ReferencePath));
    // Evaluate the codebooks
    var Results = await Evaluator.Evaluate([Reference, ...Codebooks], [ReferencePath, ...Names], ExportPath);
    console.log(chalk.green(JSON.stringify(Results, null, 4)));
    return Results;
}

/** BuildReferenceAndEvaluateCodebooksInGroups: Build a reference and evaluate a number of codebooks, using folders as groups. */
export async function BuildReferenceAndEvaluateCodebooksInGroups(
    Source: string[],
    ReferencePath: string,
    Builder: ReferenceBuilder,
    Evaluator: CodebookEvaluator,
    ExportPath?: string,
): Promise<Record<string, CodebookEvaluation>> {
    // Find all the codebooks under the path
    var [Codebooks, Names] = await LoadCodebooksInGroups(Source);
    var Backup = JSON.stringify(Codebooks);
    var Hash = md5(Backup);
    // Build the reference codebook
    var Reference = await ReadOrBuildCache(ReferencePath, Hash, () => BuildReferenceAndExport(Builder, JSON.parse(Backup), ReferencePath));
    // Evaluate the codebooks
    var Results = await Evaluator.Evaluate([Reference, ...Codebooks], [ReferencePath, ...Names], ExportPath);
    console.log(chalk.green(JSON.stringify(Results, null, 4)));
    return Results;
}
