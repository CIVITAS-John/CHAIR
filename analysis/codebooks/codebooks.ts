import * as File from 'fs';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { LLMName, EnsureFolder, RequestLLMWithCache } from "../../utils/llms.js";
import { Code, CodedThreads, Codebook, Conversation } from "../../utils/schema.js";
import { LoopThroughChunks } from "../analyzer.js";
import { GetMessagesPath, LoadAnalyses, LoadConversationsForAnalysis } from "../../utils/loader.js";
import { ExportConversationsForCoding } from '../../utils/export.js';
import { ClusterItem } from '../../utils/embeddings.js';
import { CodebookConsolidator } from './consolidator.js';
import chalk from 'chalk';

/** MergeCodebook: Simply merge the codebooks without further consolidating. */
export function MergeCodebook(Analyses: CodedThreads) {
    Analyses.Codebook = {};
    for (const [Key, Analysis] of Object.entries(Analyses.Threads)) {
        for (const [Code, Value] of Object.entries(Analysis.Codes)) {
            var Current = Analyses.Codebook[Code] ?? { Label: Value.Label, Examples: [], Definitions: [], Categories: [] };
            if (Value.Examples?.length ?? 0 > 0)
                Current.Examples = [...new Set([...Current.Examples!, ...Value.Examples!])];
            if (Value.Definitions?.length ?? 0 > 0)
                Current.Definitions = [...new Set([...Current.Definitions!, ...Value.Definitions!])];
            if (Value.Categories?.length ?? 0 > 0)
                Current.Categories = [...new Set([...Current.Categories!, ...Value.Categories!])];
            Analyses.Codebook[Code] = Current;
        }
    }
}

/** ConsolidateConversations: Load, consolidate, and export conversation codebooks. */
export async function ConsolidateConversations(Consolidator: CodebookConsolidator<Conversation>, Group: string, ConversationName: string, Analyzer: string, AnalyzerLLM: string, FakeRequest: boolean = false) {
    var ExportFolder = GetMessagesPath(Group, `Conversations/${Analyzer}-${Consolidator.Name}`);
    EnsureFolder(ExportFolder);
    // Load the conversations and analyses
    var Conversations = LoadConversationsForAnalysis(Group, ConversationName);
    var Analyses = LoadAnalyses(GetMessagesPath(Group, `Conversations/${Analyzer}/${ConversationName.replace(".json", `-${AnalyzerLLM}`)}.json`));
    // Consolidate the codebook
    await ConsolidateCodebook(Consolidator, [...Object.values(Conversations)], Analyses, async (Iteration) => {
        var Values = Object.values(Analyses.Codebook!).filter(Code => Code.Label != "[Merged]");
        Analyses.Codebook = {};
        for (var Code of Values) Analyses.Codebook[Code.Label] = Code;
        var Book = ExportConversationsForCoding(Object.values(Conversations), Analyses);
        await Book.xlsx.writeFile(`${ExportFolder}/${ConversationName.replace(".json", `-${AnalyzerLLM}-${LLMName}-${Iteration}`)}.xlsx`);
    }, FakeRequest);
    // Write the result into a JSON file
    File.writeFileSync(`${ExportFolder}/${ConversationName.replace(".json", `-${AnalyzerLLM}-${LLMName}`)}.json`, JSON.stringify(Analyses, null, 4));
    // Write the result into an Excel file
    var Book = ExportConversationsForCoding(Object.values(Conversations), Analyses);
    await Book.xlsx.writeFile(`${ExportFolder}/${ConversationName.replace(".json", `-${AnalyzerLLM}-${LLMName}`)}.xlsx`);
}

/** ConsolidateCodebook: Load, consolidate, and export codebooks. */
export async function ConsolidateCodebook<TUnit>(Consolidator: CodebookConsolidator<TUnit>, Sources: TUnit[], Analyses: CodedThreads, 
    IterationCallback?: (Iteration: number) => Promise<void>, FakeRequest: boolean = false) {
    // Check if the analysis is already done
    if (Object.keys(Analyses.Threads).length != Sources.length) 
        throw new Error(`Invalid analysis: Among ${Sources.length} threads, only ${Object.keys(Analyses.Threads).length} have been analyzed.`);
    if (!Analyses.Codebook) MergeCodebook(Analyses);
    // Ignore codes with 0 examples
    var Codes = Object.values(Analyses.Codebook!).filter(Code => (Code.Examples?.length ?? 0) > 0);
    // Run the coded threads through chunks (as defined by the consolidator)
    await LoopThroughChunks(Consolidator, Analyses, Sources, Codes, async (Currents, ChunkStart, IsFirst, Tries, Iteration) => {
        var Prompts = await Consolidator.BuildPrompts(Analyses, Sources, Currents, ChunkStart, Iteration);
        if (Prompts[0] == "" && Prompts[1] == "") return 0;
        // Run the prompts
        var Response = await RequestLLMWithCache([ new SystemMessage(Prompts[0]), new HumanMessage(Prompts[1]) ], 
            `codebooks/${Consolidator.Name}`, Tries * 0.2 + Consolidator.BaseTemperature, FakeRequest);
        if (Response == "") return 0;
        // Parse the response
        var Result = await Consolidator.ParseResponse(Analyses, Response.split("\n").map(Line => Line.trim()), Currents, ChunkStart, Iteration);
        if (typeof Result == "number") return Result;
        return 0;
    }, IterationCallback);
}

/** MergeCodes: Merge labels and definitions of two codes. */
export function MergeCodes(Parent: Code, Code: Code) {
    var Alternatives = new Set([...(Parent.Alternatives ?? []), ...(Code.Alternatives ?? []), Code.Label]);
    Alternatives.delete(Parent.Label);
    Parent.Alternatives = Array.from(Alternatives);
    Parent.Definitions = Array.from(new Set((Parent.Definitions ?? []).concat(Code.Definitions ?? [])));
    Parent.Categories = Array.from(new Set((Parent.Categories ?? []).concat(Code.Categories ?? [])));
    Parent.Examples = Array.from(new Set((Parent.Examples ?? []).concat(Code.Examples ?? [])));
    Code.Label = "[Merged]";
    return Parent;
}

/** MergeCodesByCluster: Merge codebooks based on clustering results. */
export function MergeCodesByCluster(Clusters: Record<number, ClusterItem[]>, Codes: Code[]): Record<string, Code> {
    var Codebook: Record<string, Code> = {};
    // Merge the codes based on clustering results
    for (var Key of Object.keys(Clusters)) {
        var ClusterID = parseInt(Key);
        // Pick the code with the highest probability and the shortest label + definition to merge into
        // This could inevitably go wrong. We will need another iteration to get a better new label
        var BestCode = Clusters[ClusterID]
            .sort((A, B) => B.Probability - A.Probability)
            .map(Item => Codes[Item.ID])
            .sort((A, B) => (A.Label.length * 5 + (A.Definitions?.[0]?.length ?? 0)) - (B.Label.length * 5 + (B.Definitions?.[0]?.length ?? 0)))[0];
        if (ClusterID != -1) {
            Codebook[BestCode.Label] = BestCode;
            BestCode.OldLabels = BestCode.OldLabels ?? [];
        }
        for (var Item of Clusters[ClusterID]) {
            var Code = Codes[Item.ID];
            if (ClusterID == -1) {
                // Codes that cannot be clustered
                Codebook[Code.Label] = Code;
            } else if (Code.Label != BestCode.Label) {
                // Merge the code
                console.log("Merging: " + Code.Label + " into " + BestCode.Label + " with " + (Item.Probability * 100).toFixed(2) + "% chance");
                if (BestCode.OldLabels!.includes(Code.Label) != true)
                    BestCode.OldLabels!.push(Code.Label);
                MergeCodes(BestCode, Code);
            } else {
                // Codes that have no name changes
                Codebook[Code.Label] = Code;
            }
        }
    }
    console.log(chalk.green(`Statistics: Codes merged from ${Codes.length} to ${Object.keys(Codebook).length}`));
    return Codebook;
}

/** UpdateCodes: Update code labels and definitions. */
export function UpdateCodes(Codebook: Codebook, NewCodes: Code[], Codes: Code[]): Record<string, Code> {
    var AllCodes = Object.values(Codebook);
    for (var I = 0; I < Codes.length; I++) {
        var NewCode = NewCodes[I];
        if (!NewCode) break;
        var NewLabel = NewCode.Label.toLowerCase();
        // Update the code
        Codes[I].Definitions = NewCode.Definitions;
        Codes[I].Categories = NewCode.Categories;
        // Check if the label is changed
        if (NewLabel != Codes[I].Label) {
            // Find the code with the same new label and merge
            var Parent = AllCodes.find(Current => Current.Label == NewLabel || Current.Alternatives?.includes(NewLabel));
            if (Parent && Parent != Codes[I]) {
                MergeCodes(Parent, Codes[I]);
                continue;
            }
            // Otehrwise, update the label and alternatives
            Codes[I].Alternatives = Codes[I].Alternatives ?? [];
            if (Codes[I].Alternatives!.includes(Codes[I].Label) !== true)
                Codes[I].Alternatives!.push(Codes[I].Label);
            Codes[I].Label = NewLabel;
            if (Codes[I].Alternatives!.includes(NewLabel) !== true)
                Codes[I].Alternatives!.slice(Codes[I].Alternatives!.indexOf(NewLabel), 1);
        }
    }
    return Codebook;
}

/** UpdateCategories: Update category mappings for codes. */
export function UpdateCategories(Categories: string[], NewCategories: string[], Codes: Code[]) {
    for (var I = 0; I < Categories.length; I++) {
        var Category = Categories[I];
        var NewCategory = NewCategories[I];
        for (var Code of Codes) {
            if (Code.Categories?.includes(Category)) {
                Code.Categories = Code.Categories?.filter(C => C != Category);
                if (Code.Categories?.includes(NewCategory) !== true)
                    Code.Categories.push(NewCategory);
            }
        }
    }
}

/** UpdateCategoriesByMap: Update category mappings for codes using a map. */
export function UpdateCategoriesByMap(Map: Map<string, string>, Codes: Code[]) {
    UpdateCategories([...Map.keys()], [...Map.values()], Codes);
}

/** AssignCategoriesByCluster: Assign categories based on category clustering results. */
export function AssignCategoriesByCluster(Clusters: Record<number, ClusterItem[]>, Codes: Code[]): Record<string, Code[]> {
    var Results: Record<string, Code[]> = {};
    for (var Key of Object.keys(Clusters)) {
        var ClusterID = parseInt(Key);
        var ClusterName = ClusterID == -1 ? "miscellaneous" : `cluster ${ClusterID}`;
        var Items: Code[] = [];
        for (var Item of Clusters[ClusterID]) {
            Codes[Item.ID].Categories = [ClusterName];
            Items.push(Codes[Item.ID]);
        }
        if (ClusterID != -1) 
            Results[ClusterName] = Items;
    }
    return Results;
}

/** MergeCategoriesByCluster: Merge categories based on category clustering results. */
export function MergeCategoriesByCluster(Clusters: Record<number, ClusterItem[]>, Categories: string[], Codes: Code[], TakeFirst: boolean = false): Record<string, string[]> {
    var Results: Record<string, string[]> = {};
    for (var Key of Object.keys(Clusters)) {
        var ClusterID = parseInt(Key);
        // Skip the non-clustered ones
        if (ClusterID == -1) {
            continue;
        }
        // Get the current categories
        var Subcategories = Clusters[ClusterID].map(Item => Categories[Item.ID]);
        if (Subcategories.length <= 1) continue;
        // Merge the categories
        var NewCategory = TakeFirst ? Subcategories[0] : Subcategories.join("|");
        console.log("Merging categories: " + Clusters[ClusterID].map(Item => `${Categories[Item.ID]} with ${(Item.Probability * 100).toFixed(2)}%`).join(", "));
        for (var Code of Codes) {
            if (!Code.Categories) continue;
            var Filtered = Code.Categories.filter(Category => !Subcategories.includes(Category));
            if (Filtered.length != Code.Categories.length)
                Code.Categories = Array.from(new Set([...Code.Categories.filter(Category => !Subcategories.includes(Category)), NewCategory]));
        }
        // Record the new category
        Results[NewCategory] = Subcategories;
    }
    return Results;
}