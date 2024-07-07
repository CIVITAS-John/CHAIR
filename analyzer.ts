import * as File from 'fs';
import chalk from "chalk";
import { CountItems, EnsureFolder, LLMName, MaxItems, RequestLLMWithCache } from "./utils/llms.js";
import { GetMessagesPath, LoadDataset } from "./utils/loader.js";
import { AssembleExampleFrom, CodedThread, CodedThreads, DataChunk, DataItem } from "./utils/schema.js";
import { ExportChunksForCoding } from "./utils/export.js";
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { MergeCodebook } from './consolidating/codebooks.js';

/** Analyzer: The definition of an abstract analyzer. */
export abstract class Analyzer<TUnit, TSubunit, TAnalysis> {
    /** Name: The name of the analyzer. */
    public Name: string = "Unnamed";
    /** Suffix: The suffix of the analyzer. */
    public Suffix: string = "";
    /** BaseTemperature: The base temperature for the LLM. */
    public BaseTemperature: number = 0;
    /** MaxIterations: The maximum number of iterations for the analyzer. */
    public MaxIterations: number = 1;
    /** GetChunkSize: Get the chunk configuration for the LLM. */
    // Return value: Chunk size; or [Chunk size, Prefetch, Postfetch]
    // return Recommended: the default behavior, use the recommended chunk size (ideal for coding individual subunits);
    // return 1: each subunit will be its own chunk (not recommended for the lack of context);
    // return [1, 1, 1]: each subunit will be its own chunk, and the LLM will receive the previous and next subunits as well;
    // return Remaining: all remaining subunits will be in the same chunk (ideal for coding the entire conversation). 
    // For example, for an output of [1, 1, 1], `BuildPrompts` would receive `subunits` 0 (Prefetch), 1, and 2 (Postfetch). `ChunkStart` will be 1 because that's the first message in the chunk.
    public GetChunkSize(Recommended: number, Remaining: number, Iteration: number, Tries: number): number | [number, number, number] {
        return Recommended;
    }
    /** BatchPreprocess: Preprocess the units at the very beginning. */
    public async BatchPreprocess(Units: TUnit[], Analyzed: TAnalysis[]): Promise<void> {
    }
    /** Preprocess: Preprocess the subunits before filtering and chunking. */
    public async Preprocess(Analysis: TAnalysis, Source: TUnit, Subunits: TSubunit[], Iteration: number): Promise<TSubunit[]> { return Subunits; }
    /** SubunitFilter: Filter the subunits before chunking. */
    public SubunitFilter(Subunit: TSubunit, Iteration: number): boolean { return true; }
    /** BuildPrompts: Build the prompts for the LLM. */
    // Note that the `ChunkStart` index starts from 0, which could be confusing because in our example, the first message in the prompt is 1 (with index=0).
    // `ChunkStart` is particularly useful if you want to code just 1 message but also include the context of the previous and next subunits.
    public async BuildPrompts(Analysis: TAnalysis, Source: TUnit, Subunits: TSubunit[], ChunkStart: number, Iteration: number): Promise<[string, string]> {
        return ["", ""];
    }
    /** ParseResponse: Parse the responses from the LLM. */
    // The return value is only for item-based coding, where each item has its own response. Otherwise, return {}.
    // Alternatively, it can return a number to indicate the relative cursor movement. (Actual units - Expected units, often negative.)
    public async ParseResponse(Analysis: TAnalysis, Lines: string[], Subunits: TSubunit[], ChunkStart: number, Iteration: number): Promise<Record<number, string> | number> {
        return {};
    }
}

/** ProcessDataset: Load, analyze, and export a dataset. */
export async function ProcessDataset<T extends DataItem>(Analyzer: Analyzer<DataChunk<T>, T, CodedThread>, Group: string, FakeRequest: boolean = false) {
    var Dataset = LoadDataset(Group);
    // Analyze the chunks
    for (var [Name, Chunk] of Object.entries(Dataset.Data)) {
        var Result = await AnalyzeChunk(Analyzer, Chunk, { Threads: {} }, FakeRequest);
        // Write the result into a JSON file
        EnsureFolder(GetMessagesPath(Group, `${Analyzer.Name}`));
        File.writeFileSync(GetMessagesPath(Group, `${Analyzer.Name}/${Name.replace(".json", "")}-${LLMName}${Analyzer.Suffix}.json`), JSON.stringify(Result, null, 4));
        // Write the result into an Excel file
        var Book = ExportChunksForCoding(Object.values(Chunk), Result);
        await Book.xlsx.writeFile(GetMessagesPath(Group, `${Analyzer.Name}/${Name.replace(".json", "")}-${LLMName}${Analyzer.Suffix}.xlsx`));
    }
}

/** AnalyzeChunk: Analyze a chunk of data items. */
export async function AnalyzeChunk<T extends DataItem>(Analyzer: Analyzer<DataChunk<T>, T, CodedThread>, Chunks: Record<string, DataChunk<T>>, Analyzed: CodedThreads = { Threads: {} }, FakeRequest: boolean = false): Promise<CodedThreads> {
    var Keys = Object.keys(Chunks);
    // Initialize the analysis
    for (const [Key, Chunk] of Object.entries(Chunks)) {
        var Messages = Chunk.AllItems!.filter(Message => Message.Content != "");
        var Analysis: CodedThread = Analyzed.Threads[Key];
        if (!Analysis) {
            Analysis = { ID: Key, Items: {}, Iteration: 0, Codes: {} };
            Messages.forEach(Message => Analysis.Items[Message.ID] = { ID: Message.ID });
            Analyzed.Threads[Key] = Analysis;
        }
    }
    await Analyzer.BatchPreprocess(Keys.map(Key => Chunks[Key]), Keys.map(Key => Analyzed.Threads[Key]));
    // Run the prompt over each conversation
    for (const [Key, Chunk] of Object.entries(Chunks)) {
        // Get the messages
        var Messages = Chunk.AllItems!.filter(Message => Message.Content != "");
        console.log(`Chunk ${Key}: ${Messages.length} items`);
        // Initialize the analysis
        var Analysis: CodedThread = Analyzed.Threads[Key];
        // Run the messages through chunks (as defined by the analyzer)
        var PreviousAnalysis: CodedThread | undefined;
        await LoopThroughChunks(Analyzer, Analysis, Chunk, Messages, async (Currents, ChunkStart, IsFirst, Tries, Iteration) => {
            // Sync from the previous analysis to keep the overlapping codes
            if (PreviousAnalysis && PreviousAnalysis != Analysis) {
                for (const [ID, Item] of Object.entries(PreviousAnalysis.Items)) {
                    if (Chunk.AllItems?.findIndex(Message => Message.ID == ID) != -1)
                        Analysis.Items[ID] = { ID: ID, Codes: Item.Codes };
                }
            }
            // Build the prompts
            var Prompts = await Analyzer.BuildPrompts(Analysis, Chunk, Currents, ChunkStart, Iteration);
            var Response = "";
            // Run the prompts
            if (Prompts[0] != "" || Prompts[1] != "") {
                if (!IsFirst && Analysis.Summary) Prompts[1] = `Summary of previous conversation: ${Analysis.Summary}\n${Prompts[1]}`;
                var Response = await RequestLLMWithCache([ new SystemMessage(Prompts[0]), new HumanMessage(Prompts[1]) ], 
                    `messaging-groups/${Analyzer.Name}`, Tries * 0.2 + Analyzer.BaseTemperature, FakeRequest);
                if (Response == "") return 0;
            }
            var ItemResults = await Analyzer.ParseResponse(Analysis, Response.split("\n").map(Line => Line.trim()), Currents, ChunkStart, Iteration);
            // Process the results
            if (typeof ItemResults == "number") return ItemResults;
            for (const [Index, Result] of Object.entries(ItemResults)) {
                var Message = Currents[parseInt(Index) - 1];
                var SplitByComma = !(Result.includes(";") || Result.includes("|"))
                var Codes = Result.toLowerCase().split(SplitByComma ? /,/g : /\||;/g).map(Code => Code.trim().replace(/\.$/, "").toLowerCase())
                    .filter(Code => Code != Message.Content?.toLowerCase() && Code.length > 0 && !Code.endsWith(`p${Message.UserID}`));
                // Record the codes from line-level coding
                Analysis.Items[Message.ID].Codes = Codes;
                Codes.forEach(Code => {
                    var Current = Analysis.Codes[Code] ?? { Label: Code };
                    Current.Examples = Current.Examples ?? [];
                    var Content = AssembleExampleFrom(Message);
                    if (Message.Content !== "" && !Current.Examples.includes(Content)) 
                        Current.Examples.push(Content);
                    Analysis.Codes[Code] = Current;
                });
            }
            PreviousAnalysis = Analysis;
            // Dial back the cursor if necessary
            return Object.keys(ItemResults).length - Currents.length;
        });
        Analysis.Iteration!++;
    }
    // Consolidate a codebook
    MergeCodebook(Analyzed);
    return Analyzed;
}

/** LoopThroughChunks: Process data through the analyzer in a chunkified way. */
export async function LoopThroughChunks<TUnit, TSubunit, TAnalysis>(
    Analyzer: Analyzer<TUnit, TSubunit, TAnalysis>, Analysis: TAnalysis, Source: TUnit, Sources: TSubunit[], 
    Action: (Currents: TSubunit[], ChunkStart: number, IsFirst: boolean, Tries: number, Iteration: number) => Promise<number>, 
    Iteration: (Iteration: number) => Promise<void> = async () => { }) {
    // Split units into smaller chunks based on the maximum items
    for (var I = 0; I < Analyzer.MaxIterations; I++) {
        var Cursor = 0;
        // Preprocess and filter the subunits
        Sources = await Analyzer.Preprocess(Analysis, Source, Sources, I);
        if (Sources.length == 0) continue;
        var Filtered = Sources.filter(Subunit => Analyzer.SubunitFilter(Subunit, I));
        // Loop through the subunits
        while (Cursor < Filtered.length) {
            var Tries = 0; var CursorRelative = 0;
            while (true) {
                // Get the chunk size
                var ChunkSize = Analyzer.GetChunkSize(Math.min(MaxItems, Filtered.length - Cursor), Filtered.length - Cursor, I, Tries);
                if (typeof ChunkSize == "number") {
                    if (ChunkSize < 0) {
                        console.log("Stopped iterating due to signals sent by the analyzer (<0 chunk size).");
                        return;
                    }
                    ChunkSize = [ChunkSize, 0, 0];
                }
                // Get the chunk
                var Start = Math.max(Cursor - ChunkSize[1], 0);
                var End = Math.min(Cursor + ChunkSize[0] + ChunkSize[2], Filtered.length);
                var Currents = Filtered.slice(Start, End);
                var IsFirst = Cursor == 0;
                // Run the prompts
                try {
                    CursorRelative = await Action(Currents, Cursor - Start, IsFirst, Tries, I);
                    // Sometimes, the action may return a relative cursor movement
                    if (ChunkSize[0] + CursorRelative <= 0) throw new Error("Failed to process any subunits.");
                    CountItems(ChunkSize[0], ChunkSize[0] + CursorRelative);
                    if (CursorRelative != 0)
                        console.log(`Expected ${ChunkSize[0]} subunits, processed ${ChunkSize[0] + CursorRelative} subunits.`);
                    break;
                } catch (Error: any) {
                    if (++Tries > 4) throw Error;
                    CountItems(ChunkSize[0], 0);
                    console.log(chalk.red(`Analysis error, retrying ${Tries} times:`));
                    console.log(`${Error.stack}`);
                }
            }
            // Move the cursor
            Cursor += ChunkSize[0] + CursorRelative;
        }
        // Run the iteration function
        await Iteration(I);
    }
}