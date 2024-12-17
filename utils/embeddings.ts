import * as File from "fs";

import { TaskType } from "@google/generative-ai";
import type { Embeddings } from "@langchain/core/embeddings";
import { GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";
import { OllamaEmbeddings } from "@langchain/ollama";
import { OpenAIEmbeddings } from "@langchain/openai";
import chalk from "chalk";
import * as dotenv from "dotenv";
import md5 from "md5";
import { PythonShell } from "python-shell";

import { EnsureFolder } from "./llms.js";
import type { Code } from "./schema.js";

// Model: The embedding model to use.
export let Model: Embeddings;
// EmbeddingName: The name of the embedding model.
export let EmbeddingName: string;
// Dimensions: The number of dimensions in the embedding model.
export let Dimensions: number;

/** sleep: Wait for a number of milliseconds. */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** InitializeEmbeddings: Initialize the embeddings with the given name. */
export function InitializeEmbeddings(Embedding: string) {
    dotenv.config();
    // ollama Support
    // let LocalModel = false;
    if (Embedding.startsWith("o_")) {
        Embedding = Embedding.substring(2);
        Model = new OllamaEmbeddings({
            model: Embedding,
            baseUrl: process.env.OLLAMA_URL ?? "https://127.0.0.1:11434",
        });
        // LocalModel = true;
    }
    switch (Embedding) {
        case "openai-small-512":
            Dimensions = 512;
            Model = new OpenAIEmbeddings({
                modelName: "text-embedding-3-small",
                dimensions: Dimensions,
            });
            break;
        case "openai-large-256":
            Dimensions = 256;
            Model = new OpenAIEmbeddings({
                modelName: "text-embedding-3-large",
                dimensions: Dimensions,
            });
            break;
        case "openai-large-1024":
            Dimensions = 1024;
            Model = new OpenAIEmbeddings({
                modelName: "text-embedding-3-large",
                dimensions: Dimensions,
            });
            break;
        case "gecko-768":
            Dimensions = 768;
            Model = new GoogleGenerativeAIEmbeddings({
                model: "text-embedding-004",
            });
            break;
        case "gecko-768-classification":
            Dimensions = 768;
            Model = new GoogleGenerativeAIEmbeddings({
                model: "text-embedding-004",
                taskType: TaskType.CLASSIFICATION,
            });
            break;
        case "gecko-768-clustering":
            Dimensions = 768;
            Model = new GoogleGenerativeAIEmbeddings({
                model: "text-embedding-004",
                taskType: TaskType.CLUSTERING,
            });
            break;
        case "gecko-768-similarity":
            Dimensions = 768;
            Model = new GoogleGenerativeAIEmbeddings({
                model: "text-embedding-004",
                taskType: TaskType.SEMANTIC_SIMILARITY,
            });
            break;
        case "mxbai-embed-large":
            Dimensions = 1024;
            break;
        default:
            throw new Error(`Invalid embedding model: ${Embedding}`);
    }
    EmbeddingName = Embedding;
}

/** RequestEmbeddings: Call the model to generate text embeddings with cache. */
export async function RequestEmbeddings(Sources: string[], Cache: string): Promise<Float32Array> {
    // Create the cache folder
    const CacheFolder = `known/embeddings/${Cache}/${EmbeddingName}`;
    EnsureFolder(CacheFolder);
    // Check if the cache exists
    const Embeddings = new Float32Array(Dimensions * Sources.length);
    const Requests: number[] = [];
    for (let I = 0; I < Sources.length; I++) {
        const Source = Sources[I];
        const CacheFile = `${CacheFolder}/${md5(Source)}.bytes`;
        if (File.existsSync(CacheFile)) {
            const Buffer = File.readFileSync(CacheFile);
            const Cached = new Float32Array(Buffer.buffer, Buffer.byteOffset, Buffer.byteLength / 4);
            Embeddings.set(Cached, Dimensions * I);
        } else {
            Requests.push(I);
        }
    }
    // Request the online embeddings
    const BatchSize = 50;
    for (let I = 0; I < Requests.length; I += BatchSize) {
        let Retry = 0;
        while (Retry < 10) {
            try {
                const Results = await Model.embedDocuments(Requests.slice(I, I + BatchSize).map((Index) => Sources[Index]));
                for (let J = 0; J < Results.length; J++) {
                    const Index = Requests[I + J];
                    const Embedding = new Float32Array(Results[J]);
                    // Check if all elements are 0
                    if (Embedding.every((Value) => Value === 0)) {
                        throw new Error(`Invalid embedding for: ${Sources[Index]}`);
                    }
                    Embeddings.set(Embedding, Dimensions * Index);
                    const CacheFile = `${CacheFolder}/${md5(Sources[Index])}.bytes`;
                    File.writeFileSync(CacheFile, Embedding);
                }
                break;
            } catch (Error) {
                if (Retry >= 10) {
                    throw Error;
                }
                console.error(Error);
                // Wait for 6-60 seconds
                await sleep((Retry + 1) * 6000);
                Retry++;
            }
        }
    }
    return Embeddings;
}

/** RequestEmbeddingWithCache: Call the model to generate a text embedding with cache. */
export async function RequestEmbeddingWithCache(Source: string, Cache: string): Promise<Float32Array> {
    const CacheFolder = `known/embeddings/${Cache}/${EmbeddingName}`;
    EnsureFolder(CacheFolder);
    // Check if the cache exists
    const CacheFile = `${CacheFolder}/${md5(Source)}.bytes`;
    if (File.existsSync(CacheFile)) {
        const Buffer = File.readFileSync(CacheFile);
        return new Float32Array(Buffer.buffer, Buffer.byteOffset, Buffer.byteLength / 4);
    }
    const Result = Float32Array.from(await RequestEmbedding(Source));
    File.writeFileSync(CacheFile, Result);
    return Result;
}

/** RequestEmbedding: Call the model to generate a text embedding. */
export async function RequestEmbedding(Source: string): Promise<number[]> {
    const Result = await Model.embedDocuments([Source]);
    return Result[0];
}

/** ClusterItem: The item in a cluster. */
export interface ClusterItem {
    /** ID: The ID of the item. */
    ID: number;
    /** Probability: The probability of the item. */
    Probability: number;
}

/** ClusterCodes: Categorize the codes into clusters using linkage-jc. */
export async function ClusterCodes(
    Sources: string[],
    Codes: Code[],
    Cache: string,
    ...ExtraOptions: string[]
): Promise<Record<number, ClusterItem[]>> {
    return await ClusterTexts(
        Sources,
        Codes.map((Code) => ({
            Label: Code.Label,
            Examples: Code.Examples?.map((Example) => {
                const Index = Example.indexOf("|||");
                if (Index === -1) {
                    return Example;
                }
                return Example.substring(0, Index);
            }),
        })),
        Cache,
        "linkage-jc",
        ...ExtraOptions,
    );
}

/** ClusterCategories: Categorize the categories into clusters using linkage-jc. */
export async function ClusterCategories(
    Sources: string[],
    Categories: Map<string, string[]>,
    Cache: string,
    ...ExtraOptions: string[]
): Promise<Record<number, ClusterItem[]>> {
    return await ClusterTexts(
        Sources,
        Sources.map((Category) => ({
            Label: Category,
            Examples: Categories.get(Category) ?? [],
        })),
        Cache,
        "linkage-jc",
        ...ExtraOptions,
    );
}

/** ClusterTexts: Categorize the embeddings into clusters. */
export async function ClusterTexts(
    Sources: string[],
    Names: {
        Label: string;
        Examples?: string[];
    }[],
    Cache: string,
    Method = "hdbscan",
    ...ExtraOptions: string[]
): Promise<Record<number, ClusterItem[]>> {
    console.log(chalk.gray(`Requesting embeddings for: ${Sources.length}`));
    if (Sources.length === 0) {
        return {};
    }
    const Embeddings = await RequestEmbeddings(Sources, Cache);
    return await ClusterEmbeddings(Embeddings, Names, Method, ...ExtraOptions);
}

/**
 * ClusterEmbeddings: Categorize the embeddings into clusters.
 * Return format: { Cluster: [ID, Probability][] }
 * */
export async function ClusterEmbeddings(
    Embeddings: Float32Array,
    Names: {
        Label: string;
        Examples?: string[];
    }[],
    Method = "hdbscan",
    ...ExtraOptions: string[]
): Promise<Record<number, ClusterItem[]>> {
    const Results: Record<number, ClusterItem[]> = {};
    // Write it into ./known/temp.bytes
    File.writeFileSync("./known/temp.bytes", Buffer.from(Embeddings.buffer));
    // File.writeFileSync(`./known/temp.text`, Names.join("\n"));
    File.writeFileSync("./known/clustering.temp.json", JSON.stringify(Names));
    // console.log("Embeddings sent: " + Embeddings.buffer.byteLength + " (" + Names.length + " embeddings)");
    // Run the Python script
    await PythonShell.run(`utils/embeddings/clustering_${Method}.py`, {
        args: [Dimensions.toString(), Names.length.toString(), ...ExtraOptions],
        parser: (Message) => {
            if (Message.startsWith("[")) {
                const Data = JSON.parse(Message) as number[][];
                const Clusters = Data[0];
                const Probabilities = Data[1];
                // Get unique clusters
                const UniqueClusters = [...new Set(Clusters)].sort();
                let NoCluster = 0;
                for (const Cluster of UniqueClusters) {
                    Results[Cluster] = [];
                    for (let J = 0; J < Clusters.length; J++) {
                        if (Clusters[J] === Cluster) {
                            Results[Cluster].push({ ID: J, Probability: Probabilities[J] });
                            if (Cluster === -1) {
                                NoCluster++;
                            }
                        }
                    }
                }
                console.log(
                    chalk.green(
                        `Statistics: Clusters ${UniqueClusters.length - (NoCluster > 0 ? 1 : 0)} from ${
                            Names.length
                        } items; ${NoCluster} items unclustered.`,
                    ),
                );
            } else {
                console.log(chalk.gray(Message));
            }
        },
    });
    return Results;
}

/** EvaluateTexts: Evaluate a number of texts. */
export async function EvaluateTexts<T>(
    Sources: string[],
    Labels: string[],
    Owners: number[][],
    OwnerLabels: string[],
    Cache: string,
    Method = "coverage",
    ...ExtraOptions: string[]
): Promise<T> {
    console.log(chalk.gray(`Requesting embeddings for: ${Sources.length}`));
    const Embeddings = await RequestEmbeddings(Sources, Cache);
    return await EvaluateEmbeddings(Embeddings, Labels, Owners, OwnerLabels, Method, ...ExtraOptions);
}

/**
 * EvaluateEmbeddings: Evaluate a number of embeddings.
 * Return format:
 * */
export async function EvaluateEmbeddings<T>(
    Embeddings: Float32Array,
    Labels: string[],
    Owners: number[][],
    OwnerLabels: string[],
    Method = "coverage",
    ...ExtraOptions: string[]
): Promise<T> {
    let Results: T | undefined;
    // Write it into ./known/temp.bytes
    File.writeFileSync("./known/temp.bytes", Buffer.from(Embeddings.buffer));
    // var TextData = Labels.map((Label, Index) => `${Owners[Index].join(",")}|${Label}`);
    const TextData = Labels.map((Label, Index) => ({
        Label,
        Owners: Owners[Index],
    }));
    // File.writeFileSync(`./known/temp.text`, OwnerLabels.concat(TextData).join("\n"));
    File.writeFileSync(
        "./known/evaluation.temp.json",
        JSON.stringify({
            OwnerLabels,
            Labels: TextData,
        }),
    );
    console.log(`Embeddings sent: ${Embeddings.buffer.byteLength} (${Labels.length} embeddings)`);
    // Run the Python script
    await PythonShell.run(`utils/embeddings/evaluation_${Method}.py`, {
        args: [Dimensions.toString(), Labels.length.toString(), OwnerLabels.length.toString(), ...ExtraOptions],
        parser: (Message) => {
            if (Message.startsWith("{")) {
                Results = JSON.parse(Message) as T;
            } else {
                console.log(chalk.gray(Message));
            }
        },
    });
    if (!Results) {
        throw new Error("No results returned from the Python script.");
    }
    return Results;
}
