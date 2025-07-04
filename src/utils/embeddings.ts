import { existsSync, readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import AsyncLock from "async-lock";

import { TaskType } from "@google/generative-ai";
import type { Embeddings } from "@langchain/core/embeddings";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { VertexAIEmbeddings } from "@langchain/google-vertexai";
import { OllamaEmbeddings } from "@langchain/ollama";
import { OpenAIEmbeddings } from "@langchain/openai";
import * as dotenv from "dotenv";
import md5 from "md5";

import { QAJob } from "../job.js";
import type { Code } from "../schema.js";

import { ensureFolder } from "./file.js";
import { logger } from "./logger.js";
import { sleep } from "./misc.js";
import { runPythonScript } from "./python.js";

const MODELS = {
    "openai-small-512": {
        dimensions: 512,
        model: () =>
            new OpenAIEmbeddings({
                model: "text-embedding-3-small",
                dimensions: 512,
            }),
    },
    "openai-large-256": {
        dimensions: 256,
        model: () =>
            new OpenAIEmbeddings({
                model: "text-embedding-3-large",
                dimensions: 256,
            }),
    },
    "openai-large-1024": {
        dimensions: 1024,
        model: () =>
            new OpenAIEmbeddings({
                model: "text-embedding-3-large",
                dimensions: 1024,
            }),
    },
    "gemini-embedding-001": {
        dimensions: 3072,
        model: () =>
            new VertexAIEmbeddings({
                model: "gemini-embedding-001",
            }),
    },
    "gemini-embedding-exp": {
        dimensions: 3072,
        batchSize: 100,
        model: () =>
            new GoogleGenerativeAIEmbeddings({
                model: "gemini-embedding-exp-03-07",
                taskType: TaskType.SEMANTIC_SIMILARITY,
            }),
    },
    "gecko-768-similarity": {
        dimensions: 768,
        model: () =>
            new GoogleGenerativeAIEmbeddings({
                model: "text-embedding-004",
                taskType: TaskType.SEMANTIC_SIMILARITY,
            }),
    },
} satisfies Record<
    string,
    Omit<EmbedderObject, "name" | "model"> & {
        model?: () => Embeddings;
    }
>;

export type EmbedderName = keyof typeof MODELS;
export interface EmbedderObject {
    model: Embeddings;
    name: string;
    batchSize?: number;
    dimensions: number;
    prompt?: string;
}
export interface OllamaEmbeddingsOptions {
    name: string;
    model?: string;
    dimensions: number;
    batchSize?: number;
    baseUrl?: string;
    prompt?: string;
}
export type EmbedderModel = EmbedderName | EmbedderObject;
export class EmbedderNotSupportedError extends Error {
    override name = "EmbedderNotSupportedError";
    constructor(model: string, local = false) {
        super(
            local
                ? `Embedder ${model} is local only through ollama`
                : `Embedder ${model} not supported`,
        );
    }
}

dotenv.config();

/** Initialize the Ollama embeddings with the given options. */
export const initOllamaEmbedder = (options: OllamaEmbeddingsOptions): EmbedderObject => {
    return {
        name: options.name,
        model: new OllamaEmbeddings({
            model: options.model ?? options.name,
            baseUrl: options.baseUrl ?? process.env.OLLAMA_URL ?? "https://127.0.0.1:11434",
        }),
        dimensions: options.dimensions,
        batchSize: options.batchSize ?? 50, // Default batch size
        prompt: options.prompt,
    };
};

/** Initialize the embeddings with the given name. */
export const initEmbedder = (embedder: string): EmbedderObject => {
    if (!(embedder in MODELS)) {
        throw new EmbedderNotSupportedError(embedder);
    }
    const config = MODELS[embedder as EmbedderName];
    if (!("model" in config)) {
        // No default online model
        throw new EmbedderNotSupportedError(embedder);
    }
    return {
        ...config,
        name: embedder,
        model: config.model(),
    };
};

/** Call the model to generate text embeddings with cache. */
export const requestEmbeddings = (sources: string[], cache: string): Promise<Float32Array> =>
    logger.withDefaultSource("requestEmbeddings", async () => {
        const localsources: string[] = sources.map((source) => source.trim());
        const { embedder } = QAJob.Context.get();
        if (!embedder) {
            throw new QAJob.ContextVarNotFoundError("embedder");
        }
        // Create the cache folder
        const cacheFolder = `known/embeddings/${cache}/${embedder.name}`;
        ensureFolder(cacheFolder);
        // Check if the cache exists
        const embeddings = new Float32Array(embedder.dimensions * sources.length);
        const requests: number[] = [];
        for (let i = 0; i < localsources.length; i++) {
            // Apply the prompt if provided
            localsources[i] = (embedder.prompt ?? "{input}").replace("{input}", localsources[i]);
            const cacheFile = `${cacheFolder}/${md5(localsources[i])}.bytes`;
            if (existsSync(cacheFile)) {
                const buffer = readFileSync(cacheFile);
                const cached = new Float32Array(
                    buffer.buffer,
                    buffer.byteOffset,
                    buffer.byteLength / 4,
                );
                embeddings.set(cached, embedder.dimensions * i);
            } else {
                requests.push(i);
            }
        }
        // Request the online embeddings
        const batchSize = embedder.batchSize ?? 50;
        for (let i = 0; i < requests.length; i += batchSize) {
            let retry = 0;
            while (true) {
                try {
                    // This line could debug some underlying issue behind 0 embeddings, particularly for stupid Gemini API
                    // var test = await (embedder.model as any).client.embedContent("test");
                    const res = await embedder.model.embedDocuments(
                        requests.slice(i, i + batchSize).map((idx) => localsources[idx]),
                    );
                    for (let j = 0; j < res.length; j++) {
                        const idx = requests[i + j];
                        // Cull embeddings to dimensions if necessary (need matryoshka support for the model)
                        if (res[j].length !== embedder.dimensions)
                            res[j] = res[j].slice(0, embedder.dimensions);
                        const embedding = new Float32Array(res[j]);
                        // Check if all elements are 0
                        if (embedding.every((v) => v === 0)) {
                            throw new Error(
                                `Invalid embedding for: ${sources[idx]} (at index ${idx} / i ${i} j ${j} batchSize ${batchSize})`,
                            );
                        }
                        embeddings.set(embedding, embedder.dimensions * idx);
                        const cacheFile = `${cacheFolder}/${md5(localsources[idx])}.bytes`;
                        writeFileSync(cacheFile, embedding);
                    }
                    break;
                } catch (e) {
                    logger.error(e, ++retry <= 10);
                    await sleep(6000 + retry * 2000);
                }
            }
        }
        return embeddings;
    });

/** Call the model to generate a text embedding with cache. */
export const requestEmbedding = (source: string, cache: string) =>
    logger.withDefaultSource("requestEmbedding", async () => {
        const { embedder } = QAJob.Context.get();
        if (!embedder) {
            throw new QAJob.ContextVarNotFoundError("embedder");
        }
        const cacheFolder = `known/embeddings/${cache}/${embedder.name}`;
        ensureFolder(cacheFolder);
        // Apply the prompt if provided
        source = (embedder.prompt ?? "{input}").replace("{input}", source);
        // Check if the cache exists
        const cacheFile = `${cacheFolder}/${md5(source)}.bytes`;
        if (existsSync(cacheFile)) {
            const buffer = readFileSync(cacheFile);
            return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
        }
        const res = Float32Array.from(await requestEmbeddingWithoutCache(source));
        writeFileSync(cacheFile, res);
        return res;
    });

/** Call the model to generate a text embedding. */
export const requestEmbeddingWithoutCache = async (source: string) => {
    const { embedder } = QAJob.Context.get();
    if (!embedder) {
        throw new QAJob.ContextVarNotFoundError("embedder");
    }
    return (await embedder.model.embedDocuments([source]))[0];
};

/** The item in a cluster. */
export interface ClusterItem {
    /** The ID of the item. */
    id: number;
    /** The probability of the item. */
    probability: number;
}

/** Categorize the codes into clusters using linkage-jc. */
export const clusterCodes = (sources: string[], codes: Code[], cache: string, ...opts: string[]) =>
    clusterTexts(
        sources,
        codes.map((code) => ({
            label: code.label,
            examples: code.examples?.map((example) => {
                const idx = example.indexOf("|||");
                if (idx === -1) {
                    return example;
                }
                return example.substring(0, idx);
            }),
        })),
        cache,
        "linkage-jc",
        ...opts,
    );

/** Categorize the categories into clusters using linkage-jc. */
export const clusterCategories = (
    sources: string[],
    categories: Map<string, string[]>,
    cache: string,
    ...opts: string[]
) =>
    clusterTexts(
        sources,
        sources.map((category) => ({
            label: category,
            examples: categories.get(category) ?? [],
        })),
        cache,
        "linkage-jc",
        ...opts,
    );

/** Categorize the embeddings into clusters. */
export const clusterTexts = (
    sources: string[],
    names: {
        label: string;
        examples?: string[];
    }[],
    cache: string,
    method = "hdbscan",
    ...opts: string[]
) =>
    logger.withDefaultSource("clusterTexts", async () => {
        logger.debug(`Requesting embeddings for ${sources.length} sources`);
        if (sources.length === 0) {
            return { res: {}, param: [] };
        }

        const embeddings = await requestEmbeddings(sources, cache);
        return await clusterEmbeddings(embeddings, names, method, ...opts);
    });

const embeddingLock = new AsyncLock();
/**
 * Categorize the embeddings into clusters.
 * @returns \{ cluster: [id, probability][] \}
 * */
export const clusterEmbeddings = (
    embeddings: Float32Array,
    names: {
        label: string;
        examples?: string[];
    }[],
    method = "hdbscan",
    ...opts: string[]
) =>
    logger.withDefaultSource("clusterEmbeddings", async () => {
        const { embedder } = QAJob.Context.get();
        if (!embedder) {
            throw new QAJob.ContextVarNotFoundError("embedder");
        }
        const res: Record<number, ClusterItem[]> = {};
        var param: number[] = [];
        ensureFolder("./known");
        // Lock the file to prevent concurrent writes
        await embeddingLock.acquire("temp", async () => {
            writeFileSync("./known/temp.bytes", Buffer.from(embeddings.buffer));
            writeFileSync("./known/clustering.temp.json", JSON.stringify(names));
            // console.log("Embeddings sent: " + Embeddings.buffer.byteLength + " (" + Names.length + " embeddings)");
            // Run the Python script
            const __dirname = dirname(fileURLToPath(import.meta.url));
            await runPythonScript(resolve(__dirname, `embeddings/clustering_${method}.py`), {
                args: [embedder.dimensions.toString(), names.length.toString(), ...opts],
                parser: (msg) => {
                    if (msg.startsWith("[")) {
                        const data = JSON.parse(msg) as any[];
                        const clusters = data[0] as number[];
                        const probs = data[1] as number[];
                        // More parameters from the algorithm if necessary
                        param = data.slice(2) as number[];
                        // Get unique clusters
                        const uniqueClusters = [...new Set(clusters)].sort();
                        let noCluster = 0;
                        for (const cluster of uniqueClusters) {
                            res[cluster] = [];
                            for (let j = 0; j < clusters.length; j++) {
                                if (clusters[j] === cluster) {
                                    res[cluster].push({ id: j, probability: probs[j] });
                                    if (cluster === -1) {
                                        noCluster++;
                                    }
                                }
                            }
                        }
                        logger.success(
                            `Received ${clusters.length - (noCluster > 0 ? 1 : 0)} clusters from ${names.length} items (${noCluster} items unclustered)`,
                        );
                    } else {
                        logger.debug(msg);
                    }
                },
            });
        });
        return { res, param };
    });

/** Evaluate a number of texts. */
export const evaluateTexts = <T>(
    sources: string[],
    labels: string[],
    owners: number[][],
    ownerLabels: string[],
    cache: string,
    method = "coverage",
    ...opts: string[]
) =>
    logger.withDefaultSource("evaluateTexts", async () => {
        logger.debug(`Requesting embeddings for ${sources.length} sources`);
        const embeddings = await requestEmbeddings(sources, cache);
        return evaluateEmbeddings<T>(embeddings, labels, owners, ownerLabels, method, ...opts);
    });

/**
 * EvaluateEmbeddings: Evaluate a number of embeddings.
 * Return format:
 * */
export const evaluateEmbeddings = <T>(
    embeddings: Float32Array,
    labels: string[],
    owners: number[][],
    ownerLabels: string[],
    method = "coverage",
    ...opts: string[]
) =>
    logger.withDefaultSource("evaluateEmbeddings", async () => {
        const { embedder } = QAJob.Context.get();
        if (!embedder) {
            throw new QAJob.ContextVarNotFoundError("embedder");
        }
        let res: T | undefined;
        ensureFolder("./known");
        // Lock the file to prevent concurrent writes
        await embeddingLock.acquire("temp", async () => {
            // Write it into ./known/temp.bytes
            writeFileSync("./known/temp.bytes", Buffer.from(embeddings.buffer));
            const textData = labels.map((label, index) => ({
                label,
                owners: owners[index],
            }));
            writeFileSync(
                "./known/evaluation.temp.json",
                JSON.stringify({
                    ownerLabels,
                    labels: textData,
                }),
            );
            logger.debug(
                `Embeddings sent: ${embeddings.buffer.byteLength} (${labels.length} embeddings)`,
            );
            // Run the Python script
            const __dirname = dirname(fileURLToPath(import.meta.url));
            await runPythonScript(resolve(__dirname, `embeddings/evaluation_${method}.py`), {
                args: [
                    embedder.dimensions.toString(),
                    labels.length.toString(),
                    ownerLabels.length.toString(),
                    ...opts,
                ],
                parser: (msg) => {
                    if (msg.startsWith("{")) {
                        res = JSON.parse(msg) as T;
                    } else {
                        logger.debug(msg);
                    }
                },
            });
        });
        // Check if the result is defined
        if (!res) {
            throw new Error("No results returned from evaluation Python script");
        }
        return res;
    });
