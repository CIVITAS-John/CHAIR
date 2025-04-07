import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

import { TaskType } from "@google/generative-ai";
import type { Embeddings } from "@langchain/core/embeddings";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { OllamaEmbeddings } from "@langchain/ollama";
import { OpenAIEmbeddings } from "@langchain/openai";
import * as dotenv from "dotenv";
import md5 from "md5";
import { PythonShell } from "python-shell";

import type { Code } from "../schema";
import type { IDStrFunc } from "../steps/base-step";

import { ensureFolder } from "./file";
import { logger } from "./logger";
import { sleep } from "./misc";

const MODELS = {
    "openai-small-512": {
        dimensions: 512,
        model: () =>
            new OpenAIEmbeddings({
                modelName: "text-embedding-3-small",
                dimensions: 512,
            }),
    },
    "openai-large-256": {
        dimensions: 256,
        model: () =>
            new OpenAIEmbeddings({
                modelName: "text-embedding-3-large",
                dimensions: 256,
            }),
    },
    "openai-large-1024": {
        dimensions: 1024,
        model: () =>
            new OpenAIEmbeddings({
                modelName: "text-embedding-3-large",
                dimensions: 1024,
            }),
    },
    "gecko-768": {
        dimensions: 768,
        model: () =>
            new GoogleGenerativeAIEmbeddings({
                model: "text-embedding-004",
            }),
    },
    "gecko-768-classification": {
        dimensions: 768,
        model: () =>
            new GoogleGenerativeAIEmbeddings({
                model: "text-embedding-004",
                taskType: TaskType.CLASSIFICATION,
            }),
    },
    "gecko-768-clustering": {
        dimensions: 768,
        model: () =>
            new GoogleGenerativeAIEmbeddings({
                model: "text-embedding-004",
                taskType: TaskType.CLUSTERING,
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
    "mxbai-embed-large": {
        dimensions: 1024,
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
    dimensions: number;
}
export type EmbedderModel = EmbedderName | EmbedderObject;

dotenv.config();

/** Initialize the embeddings with the given name. */
export const initEmbedder = (embedder: string): EmbedderObject => {
    // ollama Support
    if (embedder.startsWith("o_")) {
        embedder = embedder.substring(2);

        if (!(embedder in MODELS)) {
            throw new Error(`Embedder ${embedder} not supported`);
        }

        return {
            ...MODELS[embedder as EmbedderName],
            name: embedder,
            model: new OllamaEmbeddings({
                model: embedder,
                baseUrl: process.env.OLLAMA_URL ?? "https://127.0.0.1:11434",
            }),
        };
    }

    if (!(embedder in MODELS)) {
        throw new Error(`Embedder ${embedder} not supported`);
    }

    const config = MODELS[embedder as EmbedderName];
    if (!("model" in config)) {
        // No default online model
        throw new Error(`Embedder ${embedder} is local only through ollama`);
    }
    return {
        ...config,
        name: embedder,
        model: config.model(),
    };
};

/** Call the model to generate text embeddings with cache. */
export const requestEmbeddings = async (
    idStr: IDStrFunc,
    embedder: EmbedderObject,
    sources: string[],
    cache: string,
): Promise<Float32Array> => {
    const _id = idStr("requestEmbeddings");

    // Create the cache folder
    const cacheFolder = `known/embeddings/${cache}/${embedder.name}`;
    ensureFolder(cacheFolder);
    // Check if the cache exists
    const embeddings = new Float32Array(embedder.dimensions * sources.length);
    const requests: number[] = [];
    for (let i = 0; i < sources.length; i++) {
        const source = sources[i];
        const cacheFile = `${cacheFolder}/${md5(source)}.bytes`;
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
    const batchSize = 50;
    for (let i = 0; i < requests.length; i += batchSize) {
        let retry = 0;
        while (retry < 10) {
            try {
                const res = await embedder.model.embedDocuments(
                    requests.slice(i, i + batchSize).map((idx) => sources[idx]),
                );
                for (let j = 0; j < res.length; j++) {
                    const idx = requests[i + j];
                    const embedding = new Float32Array(res[j]);
                    // Check if all elements are 0
                    if (embedding.every((v) => v === 0)) {
                        throw new Error(`Invalid embedding for: ${sources[idx]}`);
                    }
                    embeddings.set(embedding, embedder.dimensions * idx);
                    const cacheFile = `${cacheFolder}/${md5(sources[idx])}.bytes`;
                    writeFileSync(cacheFile, embedding);
                }
                break;
            } catch (e) {
                logger.error(e, ++retry >= 10, _id);
                await sleep((retry + 1) * 6000);
            }
        }
    }
    return embeddings;
};

/** Call the model to generate a text embedding with cache. */
export const requestEmbedding = async (
    idStr: IDStrFunc,
    embedder: EmbedderObject,
    source: string,
    cache: string,
) => {
    const _id = idStr("requestEmbedding");

    const cacheFolder = `known/embeddings/${cache}/${embedder.name}`;
    ensureFolder(cacheFolder);
    // Check if the cache exists
    const cacheFile = `${cacheFolder}/${md5(source)}.bytes`;
    if (existsSync(cacheFile)) {
        const buffer = readFileSync(cacheFile);
        return new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
    }
    const res = Float32Array.from(await requestEmbeddingWithoutCache(idStr, embedder, source));
    writeFileSync(cacheFile, res);
    return res;
};

/** Call the model to generate a text embedding. */
export const requestEmbeddingWithoutCache = async (
    idStr: IDStrFunc,
    embedder: EmbedderObject,
    source: string,
) => {
    const _id = idStr("requestEmbeddingWithoutCache");

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
export const clusterCodes = (
    idStr: IDStrFunc,
    embedder: EmbedderObject,
    sources: string[],
    codes: Code[],
    cache: string,
    ...opts: string[]
) =>
    clusterTexts(
        idStr,
        embedder,
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
    idStr: IDStrFunc,
    embedder: EmbedderObject,
    sources: string[],
    categories: Map<string, string[]>,
    cache: string,
    ...opts: string[]
) =>
    clusterTexts(
        idStr,
        embedder,
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
export const clusterTexts = async (
    idStr: IDStrFunc,
    embedder: EmbedderObject,
    sources: string[],
    names: {
        label: string;
        examples?: string[];
    }[],
    cache: string,
    method = "hdbscan",
    ...opts: string[]
) => {
    const _id = idStr("clusterTexts");

    logger.debug(`Requesting embeddings for ${sources.length} sources`, _id);
    if (sources.length === 0) {
        return {};
    }

    const embeddings = await requestEmbeddings(idStr, embedder, sources, cache);
    return await clusterEmbeddings(idStr, embedder, embeddings, names, method, ...opts);
};

/**
 * Categorize the embeddings into clusters.
 * @returns { cluster: [id, probability][] }
 * */
export const clusterEmbeddings = async (
    idStr: IDStrFunc,
    embedder: EmbedderObject,
    embeddings: Float32Array,
    names: {
        label: string;
        examples?: string[];
    }[],
    method = "hdbscan",
    ...opts: string[]
) => {
    const _id = idStr("clusterEmbeddings");

    const res: Record<number, ClusterItem[]> = {};
    // Write it into ./known/temp.bytes
    writeFileSync("./known/temp.bytes", Buffer.from(embeddings.buffer));
    // writeFileSync(`./known/temp.text`, Names.join("\n"));
    writeFileSync("./known/clustering.temp.json", JSON.stringify(names));
    // console.log("Embeddings sent: " + Embeddings.buffer.byteLength + " (" + Names.length + " embeddings)");
    // Run the Python script
    await PythonShell.run(resolve(import.meta.dirname, `embeddings/clustering_${method}.py`), {
        args: [embedder.dimensions.toString(), names.length.toString(), ...opts],
        parser: (msg) => {
            if (msg.startsWith("[")) {
                const data = JSON.parse(msg) as number[][];
                const clusters = data[0];
                const probs = data[1];
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
                    _id,
                );
            } else {
                logger.debug(msg, _id);
            }
        },
    });
    return res;
};

/** Evaluate a number of texts. */
export const evaluateTexts = async <T>(
    idStr: IDStrFunc,
    embedder: EmbedderObject,
    sources: string[],
    labels: string[],
    owners: number[][],
    ownerLabels: string[],
    cache: string,
    method = "coverage",
    ...opts: string[]
) => {
    const _id = idStr("evaluateTexts");
    logger.debug(`Requesting embeddings for ${sources.length} sources`, _id);
    const embeddings = await requestEmbeddings(idStr, embedder, sources, cache);
    return await evaluateEmbeddings<T>(
        idStr,
        embedder,
        embeddings,
        labels,
        owners,
        ownerLabels,
        method,
        ...opts,
    );
};

/**
 * EvaluateEmbeddings: Evaluate a number of embeddings.
 * Return format:
 * */
export const evaluateEmbeddings = async <T>(
    idStr: IDStrFunc,
    embedder: EmbedderObject,
    embeddings: Float32Array,
    labels: string[],
    owners: number[][],
    ownerLabels: string[],
    method = "coverage",
    ...opts: string[]
) => {
    const _id = idStr("evaluateEmbeddings");

    let res: T | undefined;
    // Write it into ./known/temp.bytes
    writeFileSync("./known/temp.bytes", Buffer.from(embeddings.buffer));
    // let TextData = Labels.map((Label, Index) => `${Owners[Index].join(",")}|${Label}`);
    const textData = labels.map((label, index) => ({
        label,
        owners: owners[index],
    }));
    // File.writeFileSync(`./known/temp.text`, OwnerLabels.concat(TextData).join("\n"));
    writeFileSync(
        "./known/evaluation.temp.json",
        JSON.stringify({
            ownerLabels,
            labels: textData,
        }),
    );
    logger.debug(
        `Embeddings sent: ${embeddings.buffer.byteLength} (${labels.length} embeddings)`,
        _id,
    );
    // Run the Python script
    await PythonShell.run(resolve(import.meta.dirname, `embeddings/evaluation_${method}.py`), {
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
                logger.debug(msg, _id);
            }
        },
    });
    if (!res) {
        throw new Error("No results returned from evaluation Python script");
    }
    return res;
};
