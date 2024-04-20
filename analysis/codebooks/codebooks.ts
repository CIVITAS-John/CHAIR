import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { EnsureFolder, RequestLLMWithCache } from "../../utils/llms.js";
import { CodedThread, CodedThreads, Conversation } from "../../utils/schema.js";
import { Analyzer, LoopThroughChunks } from "../analyzer.js";
import { GetMessagesPath, LoadAnalyses, LoadConversationsForAnalysis } from "../../utils/loader.js";

/** CodebookConsolidator: The definition of an abstract codebook consolidator. */
export abstract class CodebookConsolidator<TUnit> extends Analyzer<TUnit[], TUnit, CodedThreads> {
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

/** ProcessConversations: Load, analyze, and export conversation codebooks. */
export async function ProcessConversations(Consolidator: CodebookConsolidator<Conversation>, Group: string, ConversationName: string, Analyzer: string, FakeRequest: boolean = false) {
    // Load the conversations and analyses
    var Conversations = LoadConversationsForAnalysis(Group, ConversationName);
    var Analyses = LoadAnalyses(GetMessagesPath(Group, `Conversations/${Analyzer}/${ConversationName.replace(".json", "")}.json`));
    // Consolidate the codebook
    await ConsolidateCodebook(Consolidator, [...Object.values(Conversations)], Analyses, FakeRequest);
    // Write the result into a JSON file
    EnsureFolder(GetMessagesPath(Group, `Conversations/${Analyzer}/${Consolidator.Name}`));
    // File.writeFileSync(GetMessagesPath(Group, `Conversations/${Analyzer}/${Consolidator.Name}/${ConversationName.replace(".json", "")}-${LLMName}.json`), JSON.stringify(Result, null, 4));
    // Write the result into an Excel file
    // var Book = ExportConversationsForCoding(Object.values(Conversations), Result);
    // await Book.xlsx.writeFile(GetMessagesPath(Group, `Conversations/${Analyzer.Name}/${ConversationName.replace(".json", "")}-${LLMName}.xlsx`));
}

/** ConsolidateCodebook: Load, consolidate, and export codebooks. */
export async function ConsolidateCodebook<TUnit>(Consolidator: CodebookConsolidator<TUnit>, Sources: TUnit[], Analyses: CodedThreads, FakeRequest: boolean = false) {
    // Check if the analysis is already done
    if (Object.keys(Analyses.Threads).length != Sources.length) 
        throw new Error(`Invalid analysis: Among ${Sources.length} threads, only ${Object.keys(Analyses.Threads).length} have been analyzed.`);
    // Run the coded threads through chunks (as defined by the consolidator)
    LoopThroughChunks(Consolidator, Analyses, Sources, Sources, async (Currents, ChunkStart, IsFirst, Tries) => {
        var Prompts = Consolidator.BuildPrompts(Analyses, Sources, Currents, ChunkStart);
        // Run the prompts
        var Response = await RequestLLMWithCache([ new SystemMessage(Prompts[0]), new HumanMessage(Prompts[1]) ], 
            `codebooks/${Consolidator.Name}`, Tries * 0.2 + Consolidator.BaseTemperature, FakeRequest);
        if (FakeRequest) return true;
        Consolidator.ParseResponse(Analyses, Response.split("\n").map(Line => Line.trim()), Currents, ChunkStart);
        return true;
    });
}
