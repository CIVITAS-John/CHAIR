import * as File from 'fs';
import * as dotenv from 'dotenv'
import md5 from 'md5';
import { Embeddings } from "@langchain/core/embeddings";
import { OpenAIEmbeddings } from "@langchain/openai";
import { EnsureFolder } from './llms.js';
import { PythonShell } from 'python-shell';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { TaskType } from "@google/generative-ai";
import chalk from 'chalk';
import { CodebookEvaluation } from './schema.js';

// Model: The embedding model to use.
export var Model: Embeddings;
// EmbeddingName: The name of the embedding model.
export var EmbeddingName: string;
// Dimensions: The number of dimensions in the embedding model.
export var Dimensions: number;

/** InitializeEmbeddings: Initialize the embeddings with the given name. */
export function InitializeEmbeddings(Embedding: string) {
    dotenv.config();
    switch (Embedding) {
        case "openai-small-512":
            Dimensions = 512;
            Model = new OpenAIEmbeddings({
                modelName: "text-embedding-3-small",
                dimensions: Dimensions
            });
            break;
        case "openai-large-256":
            Dimensions = 256;
            Model = new OpenAIEmbeddings({
                modelName: "text-embedding-3-large",
                dimensions: Dimensions
            });
            break;
        case "openai-large-1024":
            Dimensions = 1024;
            Model = new OpenAIEmbeddings({
                modelName: "text-embedding-3-large",
                dimensions: Dimensions
            });
            break;
        case "gecko-768":
            Dimensions = 768;
            Model = new GoogleGenerativeAIEmbeddings({
                model: "text-embedding-004"
            });
            break;
        case "gecko-768-classification":
            Dimensions = 768;
            Model = new GoogleGenerativeAIEmbeddings({
                model: "text-embedding-004",
                taskType: TaskType.CLASSIFICATION
            });
            break;
        case "gecko-768-clustering":
            Dimensions = 768;
            Model = new GoogleGenerativeAIEmbeddings({
                model: "text-embedding-004",
                taskType: TaskType.CLUSTERING
            });
            break;
        case "gecko-768-similarity":
            Dimensions = 768;
            Model = new GoogleGenerativeAIEmbeddings({
                model: "text-embedding-004",
                taskType: TaskType.SEMANTIC_SIMILARITY
            });
            break;
        default:
            throw new Error(`Invalid embedding model: ${Embedding}`);
    }
    EmbeddingName = Embedding;
}

/** RequestEmbeddings: Call the model to generate text embeddings with cache. */
export async function RequestEmbeddings(Sources: string[], Cache: string): Promise<Float32Array> {
    // Create the cache folder
    var CacheFolder = `known/embeddings/${Cache}/${EmbeddingName}`;
    EnsureFolder(CacheFolder);
    // Check if the cache exists
    var Embeddings = new Float32Array(Dimensions * Sources.length);
    var Requests: number[] = [];
    for (var I = 0; I < Sources.length; I++) {
        var Source = Sources[I];
        var CacheFile = `${CacheFolder}/${md5(Source)}.bytes`;
        if (File.existsSync(CacheFile)) {
            var Buffer = File.readFileSync(CacheFile);
            var Embedding = new Float32Array(Buffer.buffer, Buffer.byteOffset, Buffer.byteLength / 4);
            Embeddings.set(Embedding, Dimensions * I);
        } else {
            Requests.push(I);
        }
    }
    // Request the online embeddings
    var BatchSize = 50;
    for (var I = 0; I < Requests.length; I += BatchSize) {
        var Results = await Model.embedDocuments(Requests.slice(I, I + BatchSize).map((Index) => Sources[Index]));
        for (var J = 0; J < Results.length; J++) {
            var Index = Requests[I + J];
            var Embedding = new Float32Array(Results[J]);
            // Check if all elements are 0
            if (Embedding.every((Value) => Value == 0))
                throw new Error(`Invalid embedding for: ${Sources[Index]}`);
            Embeddings.set(Embedding, Dimensions * Index);
            var CacheFile = `${CacheFolder}/${md5(Sources[Index])}.bytes`;
            File.writeFileSync(CacheFile, Embedding);
        }
    }
    return Embeddings;
}

/** RequestEmbeddingWithCache: Call the model to generate a text embedding with cache. */
export async function RequestEmbeddingWithCache(Source: string, Cache: string): Promise<Float32Array> {
    var CacheFolder = `known/embeddings/${Cache}/${EmbeddingName}`;
    EnsureFolder(CacheFolder);
    // Check if the cache exists
    var CacheFile = `${CacheFolder}/${md5(Source)}.bytes`;
    if (File.existsSync(CacheFile)) {
        var Buffer = File.readFileSync(CacheFile);
        return new Float32Array(Buffer.buffer, Buffer.byteOffset, Buffer.byteLength / 4);
    } else {
        var Result = Float32Array.from(await RequestEmbedding(Source));
        File.writeFileSync(CacheFile, Result);
        return Result;
    }
}

/** RequestEmbedding: Call the model to generate a text embedding. */
export async function RequestEmbedding(Source: string): Promise<number[]> {
    var Result = (await Model.embedDocuments([Source]))
    return Result[0];
}

/** ClusterItem: The item in a cluster. */
export interface ClusterItem {
    /** ID: The ID of the item. */
    ID: number;
    /** Probability: The probability of the item. */
    Probability: number;
}

/** ClusterTexts: Categorize the embeddings into clusters. */
export async function ClusterTexts(Sources: string[], Names: string[], Cache: string, Method: string = "hdbscan", ...ExtraOptions: string[]): Promise<Record<number, ClusterItem[]>> {
    console.log(chalk.gray("Requesting embeddings for: " + Sources.length));
    if (Sources.length == 0) return {};
    var Embeddings = await RequestEmbeddings(Sources, Cache);
    return await ClusterEmbeddings(Embeddings, Names, Method, ...ExtraOptions);
}

/** 
 * ClusterEmbeddings: Categorize the embeddings into clusters.
 * Return format: { Cluster: [ID, Probability][] }
 * */
export async function ClusterEmbeddings(Embeddings: Float32Array, Names: string[], Method: string = "hdbscan", ...ExtraOptions: string[]): Promise<Record<number, ClusterItem[]>> {
    var Results: Record<number, ClusterItem[]> = {};
    // Write it into ./known/temp.bytes
    File.writeFileSync(`./known/temp.bytes`, Buffer.from(Embeddings.buffer));
    File.writeFileSync(`./known/temp.text`, Names.join("\n"));
    // console.log("Embeddings sent: " + Embeddings.buffer.byteLength + " (" + Names.length + " embeddings)");
    // Run the Python script
    await PythonShell.run(`analysis/embeddings/clustering-${Method}.py`, {
        args: [Dimensions.toString(), Names.length.toString(), ...ExtraOptions],
        parser: (Message) => { 
            if (Message.startsWith("[")) {
                var Data = JSON.parse(Message) as number[][];
                var Clusters = Data[0];
                var Probabilities = Data[1];
                // Get unique clusters
                var UniqueClusters = [...new Set(Clusters)].sort();
                var NoCluster = 0;
                for (var Cluster of UniqueClusters) {
                    Results[Cluster] = [];
                    for (var J = 0; J < Clusters.length; J++) {
                        if (Clusters[J] == Cluster) {
                            Results[Cluster].push({ ID: J, Probability: Probabilities[J] });
                            if (Cluster == -1) NoCluster++;
                        }
                    }
                }
                console.log(chalk.green(`Statistics: Clusters ${UniqueClusters.length - (NoCluster > 0 ? 1 : 0)} from ${Names.length} items; ${NoCluster} items unclustered.`));
            } else console.log(chalk.gray(Message));
        }
    });
    return Results;
}

/** EvaluateTexts: Evaluate a number of texts. */
export async function EvaluateTexts<T>(Sources: string[], Labels: string[], Owners: number[][], OwnerLabels: string[], Cache: string, Method: string = "coverage", ...ExtraOptions: string[]): Promise<T> {
    console.log(chalk.gray("Requesting embeddings for: " + Sources.length));
    var Embeddings = await RequestEmbeddings(Sources, Cache);
    return await EvaluateEmbeddings(Embeddings, Labels, Owners, OwnerLabels, Method, ...ExtraOptions);
}

/** 
 * EvaluateEmbeddings: Evaluate a number of embeddings.
 * Return format: 
 * */
export async function EvaluateEmbeddings<T>(Embeddings: Float32Array, Labels: string[], Owners: number[][], OwnerLabels: string[], Method: string = "coverage", ...ExtraOptions: string[]): Promise<T> {
    var Results: T | undefined;
    // Write it into ./known/temp.bytes
    File.writeFileSync(`./known/temp.bytes`, Buffer.from(Embeddings.buffer));
    var TextData = Labels.map((Label, Index) => `${Owners[Index].join(",")}|${Label}`);
    File.writeFileSync(`./known/temp.text`, OwnerLabels.concat(TextData).join("\n"));
    console.log("Embeddings sent: " + Embeddings.buffer.byteLength + " (" + Labels.length + " embeddings)");
    // Run the Python script
    await PythonShell.run(`analysis/embeddings/evaluation-${Method}.py`, {
        args: [Dimensions.toString(), Labels.length.toString(), OwnerLabels.length.toString(), ...ExtraOptions],
        parser: (Message) => { 
            if (Message.startsWith("{")) {
                Results = JSON.parse(Message) as T;
            } else console.log(chalk.gray(Message));
        }
    });
    if (!Results) throw new Error("No results returned from the Python script.");
    return Results;
}