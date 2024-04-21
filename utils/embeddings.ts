import * as File from 'fs';
import * as dotenv from 'dotenv'
import md5 from 'md5';
import { Embeddings } from "@langchain/core/embeddings";
import { OpenAIEmbeddings } from "@langchain/openai";
import { EnsureFolder } from './llms.js';

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