/**
 * Text Embedding and Clustering Utilities
 *
 * This module provides text embedding generation with caching, plus advanced clustering
 * and evaluation capabilities through Python integration (scikit-learn, HDBSCAN).
 *
 * Key Features:
 * - Multi-provider embedding support (OpenAI, Google, Ollama)
 * - Automatic batching for efficient API usage
 * - Binary cache storage (Float32Array as .bytes files) for fast retrieval
 * - Python integration for clustering (HDBSCAN, linkage-based) and evaluation
 * - Retry logic with exponential backoff for API failures
 *
 * Embedding Cache Strategy:
 * - Cache path: known/embeddings/{cache_name}/{embedder_name}/{md5(text)}.bytes
 * - Format: Raw Float32Array buffer stored as binary file
 * - MD5 hash of input text (with prompt template applied) as filename
 * - Collision handling: Acceptable risk - duplicates would get same embedding anyway
 *
 * Batching Strategy:
 * - Default batch size: 50 items per request (configurable per model)
 * - Checks cache for each item first, only requests uncached items
 * - Processes requests in batches to respect API rate limits
 * - Retry up to 10 times with 6s + (retry * 2s) delay on failure
 *
 * Python Integration:
 * - Embeddings written to known/temp.bytes as Float32Array buffer
 * - Metadata written to known/clustering.temp.json or known/evaluation.temp.json
 * - Python scripts read binary data, perform analysis, output JSON results
 * - AsyncLock prevents concurrent access to temp files
 *
 * Example Separator Convention:
 * - Code examples stored as "ID|||Speaker: Content" (see assembleExample in misc.ts)
 * - When displaying/exporting, "|||" is replaced with ": " for readability
 * - When importing, ": " is converted back to "|||" to preserve structure
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

import { TaskType } from "@google/generative-ai";
import type { Embeddings } from "@langchain/core/embeddings";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { VertexAIEmbeddings } from "@langchain/google-vertexai";
import { OllamaEmbeddings } from "@langchain/ollama";
import { OpenAIEmbeddings } from "@langchain/openai";
import AsyncLock from "async-lock";
import * as dotenv from "dotenv";
import md5 from "md5";

import { QAJob } from "../../job.js";
import type { Code } from "../../schema.js";

import { ensureFolder } from "../io/file.js";
import { logger } from "../core/logger.js";
import { sleep } from "../core/misc.js";
import { runPythonScript } from "../runtime/python.js";

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

/** Type representing the names of all predefined embedding models */
export type EmbedderName = keyof typeof MODELS;

/**
 * Configuration object for an embedding model instance
 *
 * @property model - LangChain embeddings instance for generating vectors
 * @property name - Human-readable identifier for this embedder
 * @property batchSize - Maximum number of texts to embed in a single API request
 * @property dimensions - Dimensionality of the embedding vectors
 * @property prompt - Optional prompt template to wrap input text (use {input} placeholder)
 */
export interface EmbedderObject {
    model: Embeddings;
    name: string;
    batchSize?: number;
    dimensions: number;
    prompt?: string;
}

/**
 * Options for initializing a custom Ollama embedding model
 *
 * @property name - Identifier for this embedder configuration
 * @property model - Optional Ollama model name (defaults to name)
 * @property dimensions - Dimensionality of the embedding vectors
 * @property batchSize - Maximum batch size (defaults to 50)
 * @property baseUrl - Ollama server URL (defaults to OLLAMA_URL env var or localhost:11434)
 * @property prompt - Optional prompt template with {input} placeholder
 */
export interface OllamaEmbeddingsOptions {
    name: string;
    model?: string;
    dimensions: number;
    batchSize?: number;
    baseUrl?: string;
    prompt?: string;
}

/** Type accepting either a predefined embedder name or a custom EmbedderObject */
export type EmbedderModel = EmbedderName | EmbedderObject;

/**
 * Error thrown when attempting to use an unsupported or unavailable embedding model
 */
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

/**
 * Initialize a custom Ollama embedding model with the given configuration
 *
 * @param options - Configuration for the Ollama embedder
 * @returns Configured EmbedderObject ready for use
 */
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

/**
 * Initialize an embedding model by name
 *
 * @param embedder - Name of a predefined embedding model from MODELS
 * @returns Configured EmbedderObject
 * @throws {EmbedderNotSupportedError} If embedder name not found or has no online model
 */
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

/**
 * Generate embeddings for multiple texts with caching and batching
 *
 * This is the primary function for generating embeddings. It intelligently:
 * 1. Checks cache for each text individually (MD5 hash lookup)
 * 2. Batches uncached texts together for efficient API calls
 * 3. Applies optional prompt template before embedding
 * 4. Retries failures up to 10 times with exponential backoff
 * 5. Stores results in binary cache files
 *
 * @param sources - Array of text strings to embed
 * @param cache - Cache folder name (creates known/embeddings/{cache}/{model}/)
 * @returns Float32Array containing all embeddings concatenated (length = sources.length * dimensions)
 * @throws {QAJob.ContextVarNotFoundError} If called outside an embedding context
 *
 * @example
 * const embeddings = await requestEmbeddings(["text1", "text2"], "my-analysis");
 * // Returns Float32Array with length = 2 * embedder.dimensions
 */
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
            while (retry < 10) {
                try {
                    // This line could debug some underlying issue behind 0 embeddings, particularly for stupid Gemini API
                    // var test = await (embedder.model as any).client.embedContent("test");
                    const res = await embedder.model.embedDocuments(
                        requests.slice(i, i + batchSize).map((idx) => localsources[idx]),
                    );
                    for (let j = 0; j < res.length; j++) {
                        const idx = requests[i + j];
                        // Cull embeddings to dimensions if necessary (need matryoshka support for the model)
                        if (res[j].length !== embedder.dimensions) {
                            res[j] = res[j].slice(0, embedder.dimensions);
                        }
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

/**
 * Represents an item within a cluster
 *
 * @property id - Index of the item in the original input array
 * @property probability - Confidence/membership probability for this cluster assignment (0-1)
 */
export interface ClusterItem {
    id: number;
    probability: number;
}

/**
 * Cluster codes based on their examples using embedding similarity
 *
 * This function extracts the content from code examples (before "|||" separator),
 * embeds them, and uses Python clustering to group similar codes together.
 *
 * @param sources - Array of code labels to cluster
 * @param codes - Code objects with examples to use for embedding
 * @param cache - Cache folder name for embeddings
 * @param opts - Additional options passed to the Python clustering script
 * @returns Clustering results with cluster assignments and probabilities
 */
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
        let param: number[] = [];
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
                        const data = JSON.parse(msg) as unknown[];
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
