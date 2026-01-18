/**
 * Upstash Vector Client - Handles vector storage and retrieval
 */

import { Index } from "@upstash/vector";
import type { RagDoc, RagMetadata, VectorSearchResult } from "./types";

// Upstash requires Dict type with index signature
type VectorMetadata = RagMetadata & { [key: string]: unknown };

let vectorIndex: Index<VectorMetadata> | null = null;

export function getVectorIndex(): Index<VectorMetadata> {
  if (!vectorIndex) {
    const url = process.env.UPSTASH_VECTOR_REST_URL;
    const token = process.env.UPSTASH_VECTOR_REST_TOKEN;

    if (!url || !token) {
      throw new Error(
        "Missing UPSTASH_VECTOR_REST_URL or UPSTASH_VECTOR_REST_TOKEN environment variables",
      );
    }

    vectorIndex = new Index<VectorMetadata>({
      url,
      token,
    });
  }

  return vectorIndex;
}

export interface UpsertOptions {
  docs: RagDoc[];
  embeddings: number[][];
}

export async function upsertDocuments(options: UpsertOptions): Promise<void> {
  if (options.docs.length !== options.embeddings.length) {
    throw new Error(
      `Embeddings length (${options.embeddings.length}) does not match docs length (${options.docs.length})`,
    );
  }

  const index = getVectorIndex();

  const vectors = options.docs.map((doc, i) => ({
    id: doc.id,
    vector: options.embeddings[i],
    metadata: {
      ...doc.metadata,
      text: doc.text, // Store document text in metadata for retrieval
    } as VectorMetadata,
  }));

  // Upstash has batch limits, so we chunk
  const BATCH_SIZE = 100;
  for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
    const batch = vectors.slice(i, i + BATCH_SIZE);
    await index.upsert(batch);
  }
}

export interface QueryOptions {
  embedding: number[];
  topK: number;
  filter?: string;
  includeMetadata?: boolean;
}

export async function queryVectors(
  options: QueryOptions,
): Promise<VectorSearchResult[]> {
  const index = getVectorIndex();

  const results = await index.query({
    vector: options.embedding,
    topK: options.topK,
    includeMetadata: options.includeMetadata ?? true,
    filter: options.filter,
  });

  return results.map((r) => ({
    id: r.id as string,
    score: r.score,
    metadata: r.metadata as RagMetadata,
  }));
}

export async function fetchDocumentById(
  id: string,
): Promise<{ id: string; metadata: RagMetadata } | null> {
  const index = getVectorIndex();
  const result = await index.fetch([id], { includeMetadata: true });

  if (result.length === 0 || !result[0]) {
    return null;
  }

  return {
    id: result[0].id as string,
    metadata: result[0].metadata as RagMetadata,
  };
}

export async function deleteAllDocuments(): Promise<void> {
  const index = getVectorIndex();
  await index.reset();
}

export async function getIndexInfo(): Promise<{
  vectorCount: number;
  dimension: number;
}> {
  const index = getVectorIndex();
  const info = await index.info();
  return {
    vectorCount: info.vectorCount,
    dimension: info.dimension,
  };
}
