import { writeFileSync } from "fs";
import { basename } from "path";

import { HumanMessage, SystemMessage } from "@langchain/core/messages";

import type { Analyzer } from "../analyzer";
import type { CodedThread, CodedThreads, DataChunk, DataItem, Dataset } from "../schema";
import { exportChunksForCoding } from "../utils/export";
import type { LLMModel, LLMSession } from "../utils/llms";
import { requestLLM, useLLMs } from "../utils/llms";
import { logger } from "../utils/logger";
import { assembleExampleFrom, ensureFolder, getMessagesPath } from "../utils/misc";

import type { AIParameters, IDStrFunc } from "./base-step";
import { BaseStep } from "./base-step";
import type { LoadStep } from "./load-step";

type AnalyzerConstructor<TUnit, TSubunit, TAnalysis> = new (
    ...args: ConstructorParameters<typeof Analyzer<TUnit, TSubunit, TAnalysis>>
) => Analyzer<TUnit, TSubunit, TAnalysis>;

export type CodeStepConfig<
    TUnit extends DataChunk<TSubunit>,
    TSubunit extends DataItem = DataItem,
> = {
    // To avoid confusion for AI "output" vs human "input", this is just the path to store the coded data
    path?: string; // Defaults to?
    dataset?: LoadStep<TUnit> | LoadStep<TUnit>[]; // Defaults to all datasets loaded
} & (
    | {
          agent: "Human";
          // If path doesn't exist, data will be exported to a new file (e.g. ${Path}.TODO.xlsx) for the human to code
      }
    | {
          agent: "AI";
          // Renaming "Analyzer" to "Strategy" to avoid confusion with "the LLM that analyzes the data"
          strategy:
              | AnalyzerConstructor<TUnit, TSubunit, CodedThread>
              | AnalyzerConstructor<TUnit, TSubunit, CodedThread>[];
          model: LLMModel | LLMModel[];
          parameters?: AIParameters;
      }
);

const loopThroughChunks = async <TUnit, TSubunit, TAnalysis>(
    idStr: IDStrFunc,
    dataset: Dataset<TUnit>,
    session: LLMSession,
    analyzer: Analyzer<TUnit, TSubunit, TAnalysis>,
    key: string,
    analysis: TAnalysis,
    source: TUnit,
    sources: TSubunit[],
    action: (
        currents: TSubunit[],
        chunkStart: number,
        isFirst: boolean,
        tries: number,
        iteration: number,
    ) => Promise<number>,
    iteration?: (iteration: number) => Promise<void>,
) => {
    const _id = idStr("loopThroughChunks");

    // Split units into smaller chunks based on the maximum items
    for (let i = 0; i < analyzer.maxIterations; i++) {
        logger.info(`[${dataset.name}/${key}] Iteration ${i + 1}/${analyzer.maxIterations}`, _id);
        let cursor = 0;
        // Preprocess and filter the subunits
        sources = await analyzer.preprocess(analysis, source, sources, i);
        if (sources.length === 0) {
            continue;
        }
        const filtered = sources.filter((subunit) => analyzer.subunitFilter(subunit, i));
        logger.debug(`[${dataset.name}/${key}] ${filtered.length} subunits filtered`, _id);
        // Loop through the subunits
        while (cursor < filtered.length) {
            logger.debug(`[${dataset.name}/${key}] Cursor at ${cursor}/${filtered.length}`, _id);
            let retries = 0;
            let cursorRelative = 0;
            let chunkSize = [0, 0, 0];
            while (retries <= 4) {
                // Get the chunk size
                const _chunkSize = analyzer.getChunkSize(
                    Math.min(session.llm.maxItems, filtered.length - cursor),
                    filtered.length - cursor,
                    i,
                    retries,
                );
                logger.debug(
                    `[${dataset.name}/${key}] Chunk size: ${JSON.stringify(_chunkSize)}`,
                    _id,
                );
                if (typeof _chunkSize === "number") {
                    if (_chunkSize < 0) {
                        logger.warn(
                            `[${dataset.name}/${key}] Stopped iteration due to signals sent by the analyzer (<0 chunk size)`,
                            _id,
                        );
                        return;
                    }
                    chunkSize = [_chunkSize, 0, 0];
                } else {
                    chunkSize = _chunkSize;
                }

                // Get the chunk
                const start = Math.max(cursor - chunkSize[1], 0);
                const end = Math.min(cursor + chunkSize[0] + chunkSize[2], filtered.length);
                const currents = filtered.slice(start, end);
                const isFirst = cursor === 0;
                logger.debug(
                    `[${dataset.name}/${key}] Processing block ${start}-${end} (${currents.length} subunits)`,
                    _id,
                );
                // Run the prompts
                try {
                    cursorRelative = await action(currents, cursor - start, isFirst, retries, i);
                    logger.debug(
                        `[${dataset.name}/${key}] Cursor relative movement: ${cursorRelative}`,
                        _id,
                    );
                    // Sometimes, the action may return a relative cursor movement
                    if (chunkSize[0] + cursorRelative <= 0) {
                        throw new CodeStep.InternalError("Failed to process any subunits", _id);
                    }
                    session.expectedItems += chunkSize[0];
                    session.finishedItems += chunkSize[0] + cursorRelative;
                    if (cursorRelative !== 0) {
                        logger.debug(
                            `[${dataset.name}/${key}}] Expected ${chunkSize[0]} subunits, processed ${chunkSize[0] + cursorRelative} subunits`,
                            _id,
                        );
                    }
                    break;
                } catch (e) {
                    ++retries;
                    const error = new CodeStep.InternalError(
                        `Analysis error, try ${retries}/5`,
                        _id,
                    );
                    error.cause = e;
                    if (retries > 4) {
                        throw error;
                    }
                    session.expectedItems += chunkSize[0];
                    session.finishedItems += chunkSize[0];
                    logger.error(error, true, _id);
                }
            }
            // Move the cursor
            cursor += chunkSize[0] + cursorRelative;
        }
        // Run the iteration function
        await iteration?.(i);

        logger.info(
            `[${dataset.name}/${key}] Iteration ${i + 1}/${analyzer.maxIterations} completed`,
            _id,
        );
    }
};

/** Analyze a chunk of data items. */
const analyzeChunk = async <T extends DataItem>(
    idStr: IDStrFunc,
    dataset: Dataset<DataChunk<T>>,
    session: LLMSession,
    analyzer: Analyzer<DataChunk<T>, T, CodedThread>,
    chunks: Record<string, DataChunk<T>>,
    analyzed: CodedThreads = { threads: {} },
    fakeRequest = false,
) => {
    const _id = idStr("analyzeChunk");

    const keys = Object.keys(chunks);
    logger.info(`[${dataset.name}] Analyzing ${keys.length} chunks`, _id);

    // Initialize the analysis
    for (const [key, chunk] of Object.entries(chunks)) {
        // TODO: Support subchunks
        const messages = chunk.items.filter((m) => {
            if (!("content" in m)) {
                logger.warn("Subchunks are not yet supported, skipping", _id);
                return false;
            }
            return m.content !== "";
        }) as T[];

        analyzed.threads[key] = analyzed.threads[key] ?? {
            id: key,
            items: Object.fromEntries(messages.map((m) => [m.id, { id: m.id }])),
            iteration: 0,
            codes: {},
        };
    }

    // Batch preprocess the chunks
    await analyzer.batchPreprocess(
        keys.map((k) => chunks[k]),
        keys.map((k) => analyzed.threads[k]),
    );

    // Run the prompt over each chunk
    for (const [key, chunk] of Object.entries(chunks)) {
        // Get the messages
        // TODO: Support subchunks
        const messages = chunk.items.filter((m) => {
            if (!("content" in m)) {
                logger.warn("Subchunks are not yet supported, skipping", "analyzeChunk");
                return false;
            }
            return m.content !== "";
        }) as T[];
        logger.info(`[${dataset.name}] Analyzing chunk ${key} with ${messages.length} items`, _id);

        // Initialize the analysis
        const analysis = analyzed.threads[key];
        // Run the messages through chunks (as defined by the analyzer)
        let prevAnalysis: CodedThread | undefined;
        await loopThroughChunks(
            idStr,
            dataset,
            session,
            analyzer,
            key,
            analysis,
            chunk,
            messages,
            async (currents, chunkStart, isFirst, tries, iteration) => {
                // Sync from the previous analysis to keep the overlapping codes
                if (prevAnalysis && prevAnalysis !== analysis) {
                    for (const [id, item] of Object.entries(prevAnalysis.items)) {
                        if (chunk.items.findIndex((m) => m.id === id) !== -1) {
                            analysis.items[id] = { id, codes: item.codes };
                        }
                    }
                }
                // Build the prompts
                const prompts = await analyzer.buildPrompts(
                    analysis,
                    chunk,
                    currents,
                    chunkStart,
                    iteration,
                );
                let response = "";
                // Run the prompts
                if (prompts[0] !== "" || prompts[1] !== "") {
                    if (!isFirst && analysis.summary) {
                        prompts[1] = `Summary of previous conversation: ${analysis.summary}\n${prompts[1]}`;
                    }
                    logger.debug(
                        `[${dataset.name}/${key}] Requesting LLM, iteration ${iteration}`,
                        _id,
                    );
                    response = await requestLLM(
                        idStr,
                        session,
                        [new SystemMessage(prompts[0]), new HumanMessage(prompts[1])],
                        `${basename(dataset.path)}/${analyzer.name}`,
                        tries * 0.2 + analyzer.baseTemperature,
                        fakeRequest,
                    );
                    logger.debug(
                        `[${dataset.name}/${key}] Received response, iteration ${iteration}`,
                        _id,
                    );
                    if (response === "") {
                        return 0;
                    }
                }
                const itemRes = await analyzer.parseResponse(
                    analysis,
                    response.split("\n").map((Line) => Line.trim()),
                    currents,
                    chunkStart,
                    iteration,
                );
                // Process the results
                if (typeof itemRes === "number") {
                    logger.debug(
                        `[${dataset.name}/${key}] Relative cursor movement: ${itemRes}`,
                        _id,
                    );
                    return itemRes;
                }
                // Item-based coding
                for (const [idx, res] of Object.entries(itemRes)) {
                    const message = currents[parseInt(idx) - 1];
                    const isCommaDelim = !(res.includes(";") || res.includes("|"));
                    const codes = res
                        .toLowerCase()
                        .split(isCommaDelim ? /,/g : /\||;/g)
                        .map((c) => c.trim().replace(/\.$/, "").toLowerCase())
                        .filter(
                            (c) =>
                                c.length > 0 &&
                                c !== message.content.toLowerCase() &&
                                !c.endsWith("...") &&
                                !c.endsWith("!") &&
                                !c.endsWith("?") &&
                                !c.endsWith(".") && // To avoid codes using the original content
                                !c.endsWith(`p${message.uid}`),
                        );
                    logger.debug(
                        `[${dataset.name}/${key}] Received ${codes.length} codes for message ${message.id}: ${codes.join(", ")}`,
                        _id,
                    );
                    // Record the codes from line-level coding
                    analysis.items[message.id].codes = codes;
                    codes.forEach((code) => {
                        const cur = analysis.codes[code] ?? { label: code };
                        cur.examples = cur.examples ?? [];
                        const content = assembleExampleFrom(
                            dataset.getSpeakerNameForExample,
                            message,
                        );
                        if (message.content !== "" && !cur.examples.includes(content)) {
                            cur.examples.push(content);
                            logger.debug(
                                `[${dataset.name}/${key}] Added example for code ${code}: ${content}`,
                                _id,
                            );
                        }
                        analysis.codes[code] = cur;
                    });
                }
                prevAnalysis = analysis;
                // Dial back the cursor if necessary
                const movement = Object.keys(itemRes).length - currents.length;
                logger.debug(`[${dataset.name}/${key}] Cursor movement: ${movement}`, _id);
                return movement;
            },
        );
        analysis.iteration++;
        logger.info(
            `[${dataset.name}] Analyzed chunk ${key}, iteration ${analysis.iteration}`,
            _id,
        );
    }
    return analyzed;
};

export class CodeStep<
    TUnit extends DataChunk<TSubunit>,
    TSubunit extends DataItem = DataItem,
> extends BaseStep {
    override _type = "Code";
    override dependsOn: LoadStep<TUnit>[];

    constructor(private readonly config: CodeStepConfig<TUnit, TSubunit>) {
        super();
        // If config.dataset is not provided, we will code all datasets loaded
        this.dependsOn = config.dataset
            ? Array.isArray(config.dataset)
                ? config.dataset
                : [config.dataset]
            : [];
    }

    override async execute() {
        void super.execute();
        const _id = this._idStr("execute");

        const datasets = this.dependsOn.map((step) => step.dataset);
        logger.info(`Coding ${datasets.length} datasets`, _id);

        // TODO: Support human coding
        if (this.config.agent === "Human") {
            throw new CodeStep.ConfigError("Human coding is not yet supported", _id);
        }

        const strategies = Array.isArray(this.config.strategy)
            ? this.config.strategy
            : [this.config.strategy];
        const models = Array.isArray(this.config.model) ? this.config.model : [this.config.model];

        for (const dataset of datasets) {
            logger.info(`Coding dataset ${dataset.name}`, _id);
            for (const AnalyzerClass of strategies) {
                logger.info(`[${dataset.name}] Using strategy ${AnalyzerClass.name}`, _id);
                await useLLMs(
                    this._idStr,
                    async (session) => {
                        logger.info(`[${dataset.name}] Using model ${session.llm.name}`, _id);
                        const analyzer = new AnalyzerClass(dataset, session);
                        // Analyze the chunks
                        for (const [key, chunks] of Object.entries(dataset.data)) {
                            if (this.config.agent === "Human") {
                                // TODO: Support human coding
                                throw new CodeStep.ConfigError(
                                    "Human coding is not yet supported",
                                    _id,
                                );
                            }
                            const result = await analyzeChunk(
                                this._idStr,
                                dataset,
                                session,
                                analyzer,
                                chunks,
                                { threads: {} },
                                this.config.parameters?.fakeRequest ?? false,
                            );
                            logger.success(
                                `[${dataset.name}/${AnalyzerClass.name}/${session.llm.name}] Coded ${Object.keys(result.threads).length} threads for ${key}`,
                                _id,
                            );
                            // Write the result into a JSON file
                            ensureFolder(getMessagesPath(dataset.path, analyzer.name));
                            const jsonPath = getMessagesPath(
                                dataset.path,
                                `${analyzer.name}/${key.replace(".json", "")}-${session.llm.name}${analyzer.suffix}.json`,
                            );
                            logger.info(
                                `[${dataset.name}] Writing JSON result to ${jsonPath}`,
                                _id,
                            );
                            writeFileSync(jsonPath, JSON.stringify(result, null, 4));
                            // Write the result into an Excel file
                            const book = exportChunksForCoding(
                                this._idStr,
                                Object.values(chunks),
                                result,
                            );
                            const excelPath = getMessagesPath(
                                dataset.path,
                                `${analyzer.name}/${key.replace(".json", "")}-${session.llm.name}${analyzer.suffix}.xlsx`,
                            );
                            logger.info(
                                `[${dataset.name}] Writing Excel result to ${excelPath}`,
                                _id,
                            );
                            await book.xlsx.writeFile(excelPath);
                        }
                    },
                    models,
                );
            }
        }

        this.executed = true;
    }
}
