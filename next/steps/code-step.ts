import { existsSync, readdirSync, writeFileSync } from "fs";
import { basename, extname, join } from "path";

import { select } from "@inquirer/prompts";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import open from "open";

import { type Analyzer, loopThroughChunk } from "../analyzer";
import { mergeCodebook } from "../consolidating/codebooks";
import type { CodedThread, CodedThreads, DataChunk, DataItem, Dataset } from "../schema";
import { exportChunksForCoding, importCodes } from "../utils/export";
import { ensureFolder, readJSONFile } from "../utils/file";
import type { LLMModel, LLMSession } from "../utils/llms";
import { requestLLM, useLLMs } from "../utils/llms";
import { logger } from "../utils/logger";
import { assembleExampleFrom } from "../utils/misc";

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
    dataset?: LoadStep<TUnit> | LoadStep<TUnit>[]; // Defaults to all datasets loaded
} & (
    | {
          agent: "Human";
          subdir?: string; // A path to the Excel/JSON files containing the human-coded data, relative to the dataset path (defaults to "human")
          coders?: string[]; // A list of coder names (the files are assumed to be found at <path>/<coder>.xlsx/json)
          onMissing?: "ask" | "skip" | "wait" | "abort"; // What to do if the file does not exist or is empty (defaults to "ask")
          codebookSheet?: string; // The name of the sheet to use for the codebook (defaults to "Codebook")
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

/** Analyze a chunk of data items. */
const analyzeChunks = async <T extends DataItem>(
    idStr: IDStrFunc,
    dataset: Dataset<DataChunk<T>>,
    session: LLMSession,
    analyzer: Analyzer<DataChunk<T>, T, CodedThread>,
    chunks: Record<string, DataChunk<T>>,
    analyzed: CodedThreads = { threads: {} },
    temperature?: number,
    fakeRequest = false,
) => {
    const _id = idStr("analyzeChunks");

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
        try {
            await loopThroughChunk(
                idStr,
                dataset,
                session,
                analyzer,
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
                            tries * 0.2 + (temperature ?? analyzer.baseTemperature),
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
                undefined,
            );
        } catch (e) {
            const err = new CodeStep.InternalError("Failed to analyze chunk", _id);
            err.cause = e;
            throw err;
        }
        analysis.iteration++;
        logger.info(
            `[${dataset.name}] Analyzed chunk ${key}, iteration ${analysis.iteration}`,
            _id,
        );
    }
    // Consolidate a codebook
    mergeCodebook(analyzed);
    return analyzed;
};

export class CodeStep<
    TUnit extends DataChunk<TSubunit>,
    TSubunit extends DataItem = DataItem,
> extends BaseStep {
    override dependsOn: LoadStep<TUnit>[];

    #datasets: Dataset<TUnit>[] = [];
    get datasets() {
        // Sanity check
        if (!this.executed || !this.#datasets.length) {
            throw new CodeStep.UnexecutedError(this._idStr("datasets"));
        }
        return this.#datasets;
    }

    // results[dataset][analyzer][ident] = CodedThreads
    #results = new Map<string, Record<string, Record<string, CodedThreads>>>();
    getResult(dataset: string) {
        const _id = this._idStr("getResult");

        // Sanity check
        if (!this.executed || !this.#results.size) {
            throw new CodeStep.UnexecutedError(_id);
        }
        if (!this.#results.has(dataset)) {
            throw new CodeStep.InternalError(`Dataset ${dataset} not found`, _id);
        }

        return this.#results.get(dataset) ?? {};
    }

    constructor(private readonly config: CodeStepConfig<TUnit, TSubunit>) {
        super();
        // If config.dataset is not provided, we will code all datasets loaded
        this.dependsOn = config.dataset
            ? Array.isArray(config.dataset)
                ? config.dataset
                : [config.dataset]
            : [];
    }

    async #codeAI() {
        const _id = this._idStr("executeAI");

        // Sanity check
        if (this.config.agent !== "AI") {
            throw new CodeStep.InternalError(`Invalid agent ${this.config.agent}`, _id);
        }

        const strategies = Array.isArray(this.config.strategy)
            ? this.config.strategy
            : [this.config.strategy];
        const models = Array.isArray(this.config.model) ? this.config.model : [this.config.model];
        logger.info(
            `Coding ${this.#datasets.length} datasets with strategies ${strategies.map((s) => s.name).join(", ")} and models ${models.map((m) => (typeof m === "string" ? m : m.name)).join(", ")}`,
            _id,
        );

        for (const dataset of this.#datasets) {
            logger.info(`[${dataset.name}] Coding dataset`, _id);
            for (const AnalyzerClass of strategies) {
                logger.info(`[${dataset.name}] Using strategy ${AnalyzerClass.name}`, _id);
                await useLLMs(
                    this._idStr,
                    async (session) => {
                        // Sanity check
                        if (this.config.agent !== "AI") {
                            throw new CodeStep.InternalError(
                                `Invalid agent ${this.config.agent}`,
                                _id,
                            );
                        }

                        const analyzer = new AnalyzerClass(dataset, session);
                        logger.info(
                            `[${dataset.name}/${analyzer.name}] Using model ${session.llm.name}`,
                            _id,
                        );
                        // Analyze the chunks
                        const numChunks = Object.keys(dataset.data).length;
                        for (const [idx, [key, chunks]] of Object.entries(dataset.data).entries()) {
                            logger.info(
                                `[${dataset.name}/${analyzer.name}] Analyzing chunk ${key} (${idx + 1}/${numChunks})`,
                                _id,
                            );
                            const result = await analyzeChunks(
                                this._idStr,
                                dataset,
                                session,
                                analyzer,
                                chunks,
                                { threads: {} },
                                this.config.parameters?.temperature,
                                this.config.parameters?.fakeRequest ?? false,
                            );
                            logger.success(
                                `[${dataset.name}/${analyzer.name}/${key}] Coded ${Object.keys(result.threads).length} threads (${idx + 1}/${numChunks})`,
                                _id,
                            );

                            const filename = `${key.replace(".json", "")}-${session.llm.name}${analyzer.suffix}`;
                            // Write the result into a JSON file
                            const analyzerPath = ensureFolder(join(dataset.path, analyzer.name));
                            const jsonPath = join(analyzerPath, `${filename}.json`);
                            logger.info(
                                `[${dataset.name}/${analyzer.name}/${key}] Writing JSON result to ${jsonPath}`,
                                _id,
                            );
                            writeFileSync(jsonPath, JSON.stringify(result, null, 4));

                            // Write the result into an Excel file
                            const book = exportChunksForCoding(
                                this._idStr,
                                Object.values(chunks),
                                result,
                            );
                            const excelPath = join(analyzerPath, `${filename}.xlsx`);
                            logger.info(
                                `[${dataset.name}/${analyzer.name}/${key}] Writing Excel result to ${excelPath}`,
                                _id,
                            );
                            await book.xlsx.writeFile(excelPath);

                            // Store the result
                            const cur = this.#results.get(dataset.name) ?? {};
                            this.#results.set(dataset.name, {
                                ...cur,
                                [analyzer.name]: {
                                    ...(cur[analyzer.name] ?? {}),
                                    [filename]: result,
                                },
                            });
                        }
                    },
                    models,
                );
            }
        }
    }

    async #codeHuman() {
        const _id = this._idStr("executeHuman");

        // Sanity check
        if (this.config.agent !== "Human") {
            throw new CodeStep.InternalError(`Invalid agent ${this.config.agent}`, _id);
        }

        logger.info(`Coding ${this.#datasets.length} datasets with human`, _id);

        for (const dataset of this.#datasets) {
            logger.info(`[${dataset.name}] Loading human codes`, _id);

            const loadExcel = async (path: string, sheet?: string) => {
                if (!existsSync(path)) {
                    logger.warn(`File ${path} does not exist`, _id);
                    return;
                }

                try {
                    const analyses = await importCodes(this._idStr, path, sheet);
                    logger.info(`[${dataset.name}] Loaded codes via Excel from ${path}`, _id);
                    return analyses;
                } catch (error) {
                    logger.warn(
                        `[${dataset.name}] Failed to load codes via Excel from ${path}: ${error instanceof Error ? error.message : JSON.stringify(error)}, trying JSON`,
                        _id,
                    );
                }
            };
            const loadJSON = (path: string) => {
                if (!existsSync(path)) {
                    logger.warn(`File ${path} does not exist`, _id);
                    return;
                }

                const analyses: CodedThreads = readJSONFile(path);
                if (!("threads" in analyses)) {
                    throw new CodeStep.ConfigError(`Invalid JSON code file: ${path}`, _id);
                }
                logger.info(`[${dataset.name}] Loaded codes via JSON from ${path}`, _id);
                return analyses;
            };

            const basePath = ensureFolder(join(dataset.path, this.config.subdir ?? "human"));
            const coders = new Set(
                this.config.coders ??
                    readdirSync(basePath)
                        .filter((file) => {
                            const ext = extname(file).toLowerCase();
                            return ext === ".xlsx" || ext === ".json";
                        })
                        .map((file) => basename(file, extname(file))),
            );

            if (!coders.size) {
                throw new CodeStep.ConfigError(
                    `No coders found in ${basePath}; please provide a valid path or a list of coders`,
                    _id,
                );
            }

            const codes: Record<string, CodedThreads> = {};
            for (const coder of coders) {
                logger.info(`[${dataset.name}] Loading codes for coder "${coder}"`, _id);
                const excelPath = join(basePath, `${coder}.xlsx`);
                let analyses =
                    (await loadExcel(excelPath, this.config.codebookSheet)) ??
                    loadJSON(join(basePath, `${coder}.json`));

                // Check if analyses is empty
                if (!analyses || !Object.keys(analyses.threads).length) {
                    if (!existsSync(excelPath)) {
                        logger.warn(
                            `[${dataset.name}] Exporting empty Excel workbook for coder "${coder}"`,
                            _id,
                        );
                        // Export empty Excel file
                        const book = exportChunksForCoding(
                            this._idStr,
                            Object.values(dataset.data).flatMap((cg) => Object.values(cg)),
                        );
                        await book.xlsx.writeFile(excelPath);
                    }

                    let action = this.config.onMissing ?? "ask";
                    if (action === "ask") {
                        logger.lock();
                        action = await select({
                            message: `No analyses found for human coder "${coder}". What do you want to do?`,
                            choices: [
                                { name: "Skip this coder", value: "skip" },
                                { name: `Wait for coder to fill in ${excelPath}`, value: "wait" },
                                { name: "Abort and exit", value: "abort" },
                            ],
                        });
                        logger.unlock();
                    }

                    logger.debug(`[${dataset.name}] Action for coder "${coder}": ${action}`, _id);

                    if (action === "skip") {
                        logger.warn(`[${dataset.name}] Skipping coder "${coder}"`, _id);
                        continue;
                    }

                    if (action === "abort") {
                        logger.warn(`[${dataset.name}] User requested to abort`, _id);
                        this.abort(_id);
                        return;
                    }

                    while (!analyses || !Object.keys(analyses.threads).length) {
                        logger.lock();
                        console.log(
                            `Waiting for coder "${coder}" to close the file at ${excelPath}...\n`,
                        );
                        await open(excelPath, { wait: true });
                        logger.unlock();
                        analyses = await loadExcel(excelPath, this.config.codebookSheet);
                    }
                }

                codes[coder] = analyses;
                logger.success(
                    `[${dataset.name}] Loaded ${Object.keys(analyses.threads).length} threads from "${coder}"`,
                    _id,
                );
            }

            if (!Object.keys(codes).length) {
                logger.warn(
                    `[${dataset.name}] No codes loaded, did you skip all human coders?`,
                    _id,
                );
            }

            // Store the result
            this.#results.set(dataset.name, {
                human: codes,
            });
        }
    }

    override async execute() {
        const _id = this._idStr("execute");
        await super.execute();

        this.#datasets = this.dependsOn.map((step) => step.dataset);
        logger.info(`Coding ${this.#datasets.length} datasets`, _id);

        // Cast the agent to a generic string to perform runtime checks
        const agent = this.config.agent as string;
        if (agent === "AI") {
            await this.#codeAI();
        } else if (agent === "Human") {
            await this.#codeHuman();
        } else {
            throw new CodeStep.ConfigError(`Invalid agent ${agent}`, _id);
        }

        this.executed = true;
    }
}
