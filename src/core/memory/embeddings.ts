/**
 * Vector Embedding Service
 * Uses @xenova/transformers for local embedding generation
 */

import { pipeline } from "@xenova/transformers";

export const EMBEDDING_MODEL = "Xenova/all-MiniLM-L6-v2";

let embeddingPipeline: any = null;

/**
 * Initialize the embedding pipeline
 */
async function getPipeline() {
    if (!embeddingPipeline) {
        // Using all-MiniLM-L6-v2: small (23MB), fast, and good for semantic search
        embeddingPipeline = await pipeline("feature-extraction", EMBEDDING_MODEL);
    }
    return embeddingPipeline;
}

/**
 * Generate a vector embedding for a given text
 */
export async function generateEmbedding(text: string): Promise<number[]> {
    const extractor = await getPipeline();
    const output = await extractor(text, {
        pooling: "mean",
        normalize: true,
    });

    const vector = Array.from(output.data) as number[];
    if (vector.length !== 384) {
        console.warn(`[Embeddings] Unexpected vector length: ${vector.length} (expected 384)`);
    }

    return vector;
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
