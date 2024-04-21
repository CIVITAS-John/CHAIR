import * as File from 'fs';
import md5 from 'md5';
import { Embeddings } from "@langchain/core/embeddings";
import { OpenAIEmbeddings } from "@langchain/openai";
import { EnsureFolder } from './llms.js';

// Model: The embedding model to use.
export var Model: Embeddings;
// EmbeddingName: The name of the embedding model.
export var EmbeddingName: string;

/** InitializeEmbeddings: Initialize the embeddings with the given name. */
export function InitializeEmbeddings(Embedding: string) {
    switch (Embedding) {
        case "openai-small-512":
            Model = new OpenAIEmbeddings({
                modelName: "text-embedding-3-small",
                dimensions: 512
            });
            break;
        case "openai-large-256":
            Model = new OpenAIEmbeddings({
                modelName: "text-embedding-3-large",
                dimensions: 256
            });
            break;
        default:
            throw new Error(`Invalid embedding model: ${Embedding}`);
    }
}

/** RequestEmbeddingWithCache: Call the model to generate a text embedding with cache. */
export async function RequestEmbeddingWithCache(Source: string, Cache: string): Promise<number[]> {
    var CacheFolder = `known/embeddings/${Cache}/${EmbeddingName}`;
    EnsureFolder(CacheFolder);
    // Check if the cache exists
    var CacheFile = `${CacheFolder}/${md5(Source)}.bytes`;
    if (File.existsSync(CacheFile)) {
        var Buffer = File.readFileSync(CacheFile, null).buffer;
        return Array.from(new Float32Array(Buffer));
    } else {
        var Result = await RequestEmbedding(Source);
        File.writeFileSync(CacheFile, Float32Array.from(Result));
        return Result;
    }
}

/** RequestEmbedding: Call the model to generate a text embedding. */
export async function RequestEmbedding(Source: string): Promise<number[]> {
    return (await Model.embedDocuments([Source]))[0];
}