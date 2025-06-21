import type { Codebook, CodebookEvaluation } from "../schema.js";

/** An evaluator of codebook. */
export abstract class CodebookEvaluator {
    /** The name of the evaluator. */
    name = "Unnamed";
    /** Evaluate a number of codebooks. */
    abstract evaluate(
        reference: Codebook,
        codebooks: Record<string, Codebook>,
        groups: Record<string, [Codebook, string[]]>,
        exportPath: string,
    ): Promise<Record<string, CodebookEvaluation>>
}

// /** EvaluateCodebooksWithReference: Evaluate a number of codebooks. */
// export async function EvaluateCodebooksWithReference(
//     Source: string | string[],
//     Evaluator: CodebookEvaluator,
//     ExportPath?: string,
// ): Promise<Record<string, CodebookEvaluation>> {
//     // Find all the codebooks under the path
//     const [Codebooks, Names] = await LoadCodebooks(Source);
//     // Evaluate the codebooks
//     const Results = await Evaluator.Evaluate(Codebooks, Names, ExportPath);
//     console.log(chalk.green(JSON.stringify(Results, null, 4)));
//     return Results;
// }

// /** BuildReferenceAndEvaluateCodebooks: Build a reference and evaluate a number of codebooks. */
// export async function BuildReferenceAndEvaluateCodebooks(
//     Source: string | string[],
//     ReferencePath: string,
//     Builder: ReferenceBuilder,
//     Evaluator: CodebookEvaluator,
//     ExportPath?: string,
//     CreateGroup?: boolean,
// ): Promise<Record<string, CodebookEvaluation>> {
//     // Find all the codebooks under the path
//     const [Codebooks, _Names] = await LoadCodebooks(Source, CreateGroup);
//     let Names = _Names;
//     // Remove commonality from multiple codebooks
//     if (Names.length === 1) {
//         Names = [Path.basename(Names[0])];
//     } else {
//         Names = RemoveCommonality(Names);
//     }
//     // Build the reference codebook
//     const RealCodebooks = Codebooks.filter((_, I) => !Names[I].startsWith("group: "));
//     const Backup = JSON.stringify(RealCodebooks);
//     const Hash = md5(Backup);
//     const Reference = await ReadOrBuildCache(ReferencePath, Hash, () =>
//         BuildReferenceAndExport(Builder, JSON.parse(Backup) as Codebook[], ReferencePath),
//     );
//     // Evaluate the codebooks
//     const Results = await Evaluator.Evaluate(
//         [Reference, ...Codebooks],
//         [ReferencePath, ...Names],
//         ExportPath,
//     );
//     console.log(chalk.green(JSON.stringify(Results, null, 4)));
//     return Results;
// }

// /** BuildReferenceAndEvaluateCodebooksInGroups: Build a reference and evaluate a number of codebooks, using folders as groups. */
// export async function BuildReferenceAndEvaluateCodebooksInGroups(
//     Source: string[],
//     ReferencePath: string,
//     Builder: ReferenceBuilder,
//     Evaluator: CodebookEvaluator,
//     ExportPath?: string,
// ): Promise<Record<string, CodebookEvaluation>> {
//     // Find all the codebooks under the path
//     const [Codebooks, Names] = await LoadCodebooksInGroups(Source);
//     const Backup = JSON.stringify(Codebooks);
//     const Hash = md5(Backup);
//     // Build the reference codebook
//     const Reference = await ReadOrBuildCache(ReferencePath, Hash, () =>
//         BuildReferenceAndExport(Builder, JSON.parse(Backup) as Codebook[], ReferencePath),
//     );
//     // Evaluate the codebooks
//     const Results = await Evaluator.Evaluate(
//         [Reference, ...Codebooks],
//         [ReferencePath, ...Names],
//         ExportPath,
//     );
//     console.log(chalk.green(JSON.stringify(Results, null, 4)));
//     return Results;
// }
