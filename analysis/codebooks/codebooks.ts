import * as File from 'fs';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { LLMName, EnsureFolder, RequestLLMWithCache } from "../../utils/llms.js";
import { Code, CodedThreads, Conversation } from "../../utils/schema.js";
import { Analyzer, LoopThroughChunks } from "../analyzer.js";
import { GetMessagesPath, LoadAnalyses, LoadConversationsForAnalysis } from "../../utils/loader.js";
import { ExportConversationsForCoding } from '../../utils/export.js';
import { ClusterItem } from '../../utils/embeddings.js';

/** CodebookConsolidator: The definition of an abstract codebook consolidator. */
export abstract class CodebookConsolidator<TUnit> extends Analyzer<TUnit[], Code, CodedThreads> {
}

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
        var Book = ExportConversationsForCoding(Object.values(Conversations), Analyses);
        await Book.xlsx.writeFile(`${ExportFolder}/${ConversationName.replace(".json", `-${AnalyzerLLM}-${LLMName}-iteration-${Iteration}`)}.xlsx`);
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
    var LastIteration = 0;
    // Run the coded threads through chunks (as defined by the consolidator)
    await LoopThroughChunks(Consolidator, Analyses, Sources, Codes, async (Currents, ChunkStart, IsFirst, Tries, Iteration) => {
        if (Iteration != LastIteration) await IterationCallback?.(LastIteration);
        LastIteration = Iteration;
        var Prompts = await Consolidator.BuildPrompts(Analyses, Sources, Currents, ChunkStart, Iteration);
        if (Prompts[0] == "" && Prompts[1] == "") return true;
        // Run the prompts
        var Response = await RequestLLMWithCache([ new SystemMessage(Prompts[0]), new HumanMessage(Prompts[1]) ], 
            `codebooks/${Consolidator.Name}`, Tries * 0.2 + Consolidator.BaseTemperature, FakeRequest);
        if (Response == "") return true;
        await Consolidator.ParseResponse(Analyses, Response.split("\n").map(Line => Line.trim()), Currents, ChunkStart, Iteration);
        return true;
    });
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
            .sort((A, B) => (A.Label.length * 5 + (A.Definitions?.[0].length ?? 0)) - (B.Label.length * 5 + (B.Definitions?.[0].length ?? 0)))[0];
        if (ClusterID != -1) {
            Codebook[BestCode.Label] = BestCode;
            BestCode.Alternatives = BestCode.Alternatives ?? [];
            BestCode.Categories = BestCode.Categories ?? [];
            BestCode.Definitions = BestCode.Definitions ?? [];
            BestCode.Examples = BestCode.Examples ?? [];
        }
        for (var Item of Clusters[ClusterID]) {
            var Code = Codes[Item.ID];
            // Only merge codes with high probability
            if (ClusterID == -1 || Item.Probability <= 0.95) {
                // Codes that cannot be clustered
                Codebook[Code.Label] = Code;
            } else if (Code.Label != BestCode.Label) {
                // Merge the code
                BestCode.Alternatives!.push(Code.Label);
                if ((Code.Categories?.length ?? 0) > 0)
                    BestCode.Categories = [...new Set([...BestCode.Categories!, ...Code.Categories!])];
                if ((Code.Definitions?.length ?? 0) > 0)
                    BestCode.Definitions = [...new Set([...BestCode.Definitions!, ...Code.Definitions!])];
                if ((Code.Examples?.length ?? 0) > 0)
                    BestCode.Examples = [...new Set([...BestCode.Examples!, ...Code.Examples!])];
                if ((Code.Alternatives?.length ?? 0) > 0)
                    BestCode.Alternatives = [...new Set([...BestCode.Alternatives!, ...Code.Alternatives!])];
                console.log("Merging: " + Code.Label + " into " + BestCode.Label + " with " + (Item.Probability * 100).toFixed(2) + "% chance");
                Code.Label = "[Merged]";
            }
        }
    }
    console.log(`Codes reduced from ${Codes.length} to ${Object.keys(Codebook).length}`);
    return Codebook;
}