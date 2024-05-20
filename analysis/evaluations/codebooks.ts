import * as File from 'fs';
import * as Path from 'path';
import { Codebook, CodebookEvaluation } from "../../utils/schema.js";
import { GetFilesRecursively, ReadOrBuildCache } from '../../utils/file.js';
import chalk from 'chalk';
import { BuildReferenceAndExport, ReferenceBuilder } from './reference-builder.js';
import md5 from 'md5';
import commonPathPrefix from 'common-path-prefix';
import { LoadCodedConversations } from '../../utils/loader.js';

/** CodebookEvaluator: An evaluator of codebook. */
export abstract class CodebookEvaluator {
    /** Name: The name of the evaluator. */
    public Name: string = "Unnamed";
    /** Evaluate: Evaluate a number of codebooks. */
    public abstract Evaluate(Codebooks: Codebook[], Names: string[], ExportPath?: string): Promise<Record<string, CodebookEvaluation>>;
}

/** EvaluateCodebooksWithReference: Evaluate a number of codebooks. */
export async function EvaluateCodebooksWithReference(Source: string | string[], Evaluator: CodebookEvaluator, ExportPath?: string): Promise<Record<string, CodebookEvaluation>> {
    // Find all the codebooks under the path
    var [ Codebooks, Names ] = await LoadCodebooks(Source);
    // Evaluate the codebooks
    var Results = await Evaluator.Evaluate(Codebooks, Names, ExportPath);
    console.log(chalk.green(JSON.stringify(Results, null, 4)));
    return Results;
}

/** BuildReferenceAndEvaluateCodebooks: Build a reference and evaluate a number of codebooks. */
export async function BuildReferenceAndEvaluateCodebooks(Source: string | string[], ReferencePath: string, Builder: ReferenceBuilder, Evaluator: CodebookEvaluator, 
    ExportPath?: string, ComparingCodebooks?: string[]): Promise<Record<string, CodebookEvaluation>> {
    // Find all the codebooks under the path
    var [ Codebooks, Names ] = await LoadCodebooks(Source);
    var Hash = md5(JSON.stringify(Codebooks));
    // Build the reference codebook
    var Reference = await ReadOrBuildCache(ReferencePath, Hash, () => BuildReferenceAndExport(Builder, Codebooks, ReferencePath));
    // Read the comparing codebooks
    if (ComparingCodebooks)
        [ Codebooks, Names ] = await LoadCodebooks(ComparingCodebooks);
    // Evaluate the codebooks
    var Results = await Evaluator.Evaluate([Reference, ...Codebooks], [ReferencePath, ...Names], ExportPath);
    console.log(chalk.green(JSON.stringify(Results, null, 4)));
    return Results;
}

/** LoadCodebooks: Load codebooks from a source. */
export async function LoadCodebooks(Source: string | string[]): Promise<[Codebook[], string[]]> {
    // Load potential paths
    var Sources: string[] = [];
    if (typeof(Source) == "string") {
        Sources = GetFilesRecursively(Source);
    } else {
        Sources = Source.map(Source => GetFilesRecursively(Source)).flat();
    }
    // Remove the in-process codebooks
    Sources = Sources.filter(Source => !Source.match(/\-(\d)+.xlsx$/g)).sort();
    // Load the codebooks
    var Codebooks: Codebook[] = [];
    var Names: string[] = [];
    for (var Current of Sources) {
        if (Current.endsWith(".json")) {
            var Content = File.readFileSync(`${Current}`, 'utf8');
            var Parsed = JSON.parse(Content);
            if (Parsed.Codebook) {
                console.log(`Loading ${Current} as coded threads.`)
                Codebooks.push(Parsed.Codebook);
            } else if (!Parsed.Threads) {
                console.log(`Loading ${Current} as a codebook.`)
                Codebooks.push(Parsed);
            } else {
                console.log(`Skipping ${Current} because it is not a codebook.`);
                continue;
            }
        } else if (Current.endsWith(".xlsx")) {
            var Name = Current.slice(0, Current.length - 5);
            if (Names.includes(Name)) {
                console.log(`Skipping ${Current} because another version is already loaded.`);
                continue;
            }
            console.log(`Loading ${Current} as an Excel workbook.`);
            Codebooks.push((await LoadCodedConversations(Current)).Codebook!);
        } else continue;
        Names.push(Current.substring(0, Current.length - Path.extname(Current).length));
    }
    // Find common prefixes and remove them
    var Prefix = commonPathPrefix(Names, "-");
    if (Prefix.length == 0) Prefix = commonPathPrefix(Names, "/");
    Names = Names.map(Name => Name.substring(Prefix.length));
    // Find common suffixes and remove them
    var Suffix = Reverse(commonPathPrefix(Names.map(Name => Reverse(Name)), "-"));
    Names = Names.map(Name => Name.substring(0, Name.length - Suffix.length));
    console.log(chalk.green(`Statistics: Loaded ${Codebooks.length} codebooks.`));
    return [Codebooks, Names];
}

/** Reverse: Reverse a string. */
function Reverse(S: string): string {
    return [...S].reverse().join("");
}