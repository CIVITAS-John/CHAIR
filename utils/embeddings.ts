import * as File from 'fs';
import * as dotenv from 'dotenv'
import md5 from 'md5';
import { Embeddings } from "@langchain/core/embeddings";
import { OpenAIEmbeddings } from "@langchain/openai";
import { EnsureFolder } from './llms.js';
import { PythonShell } from 'python-shell';

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
        case "openai-large-512":
            Dimensions = 1024;
            Model = new OpenAIEmbeddings({
                modelName: "text-embedding-3-large",
                dimensions: Dimensions
            });
            break;
        default:
            throw new Error(`Invalid embedding model: ${Embedding}`);
    }
    EmbeddingName = Embedding;
}

/** RequestEmbeddings: Call the model to generate text embeddings with cache. */
export async function RequestEmbeddings(Sources: string[], Cache: string): Promise<Float32Array> {
    var Embeddings = new Float32Array(Dimensions * Sources.length);
    for (var I = 0; I < Sources.length; I++) {
        var CodeString = Sources[I];
        var Embedding = await RequestEmbeddingWithCache(CodeString, Cache);
        Embeddings.set(Embedding, Dimensions * I);
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
    return (await Model.embedDocuments([Source]))[0];
}

/** ClusterItem: The item in a cluster. */
export interface ClusterItem {
    /** ID: The ID of the item. */
    ID: number;
    /** Probability: The probability of the item. */
    Probability: number;
}

/** ClusterTexts: Categorize the embeddings into clusters. */
export async function ClusterTexts(Sources: string[], Cache: string, Method: string = "hdbscan", ...ExtraOptions: string[]): Promise<Record<number, ClusterItem[]>> {
    console.log("Requesting embeddings for: " + Sources.length);
    var Embeddings = await RequestEmbeddings(Sources, Cache);
    return await ClusterEmbeddings(Embeddings, Sources.length, Method, ...ExtraOptions);
}

/** 
 * ClusterEmbeddings: Categorize the embeddings into clusters.
 * Return format: { Cluster: [ID, Probability][] }
 * */
export async function ClusterEmbeddings(Embeddings: Float32Array, Items: number, Method: string = "hdbscan", ...ExtraOptions: string[]): Promise<Record<number, ClusterItem[]>> {
    var Results: Record<number, ClusterItem[]> = {};
    // Write it into ./known/temp.bytes
    File.writeFileSync(`./known/temp.bytes`, Buffer.from(Embeddings.buffer));
    console.log("Embeddings sent: " + Embeddings.buffer.byteLength + " (" + Items + " embeddings)");
    // Run the Python script
    await PythonShell.run(`analysis/codebooks/embedding-${Method}.py`, {
        args: [Dimensions.toString(), Items.toString(), ...ExtraOptions],
        parser: (Message) => { 
            if (Message.startsWith("[")) {
                var Data = JSON.parse(Message) as number[][];
                var Clusters = Data[0];
                var Probabilities = Data[1];
                // Get unique clusters
                var UniqueClusters = [...new Set(Clusters)].sort();
                for (var Cluster of UniqueClusters) {
                    Results[Cluster] = [];
                    for (var J = 0; J < Clusters.length; J++) {
                        if (Clusters[J] == Cluster)
                            Results[Cluster].push({ ID: J, Probability: Probabilities[J] });
                    }
                }
                console.log(`Clusters: ${UniqueClusters.length} from ${Items} items`);
            } else console.log(Message);
        }
    });
    return Results;
}