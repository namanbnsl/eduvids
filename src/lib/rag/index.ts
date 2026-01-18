/**
 * RAG Module - Semantic retrieval for diagram examples and schemas
 *
 * This module provides smart retrieval of diagram examples and schema docs
 * based on the user's video topic. The full system prompt is always included
 * separately - RAG only adds topic-specific illustrations.
 *
 * Usage:
 *   import { getRagContext, formatRagContext } from "@/lib/rag";
 *
 *   const context = await getRagContext("Why does carbon form allotropes?");
 *   const contextString = formatRagContext(context);
 *   // Append contextString to the system prompt
 */

// Types
export type {
  RagDoc,
  RagDocType,
  RagMetadata,
  RagResult,
  RagDomain,
  QueryIntent,
  VectorSearchResult,
} from "./types";

// Retrieval (main API)
export { getRagContext, formatRagContext, cacheDocText } from "./retrieve";

// Intent inference
export { inferQueryIntent, shouldIncludeDoc } from "./intent";

// Document building (for indexing)
export { buildAllDocs, buildExampleDocs, buildSchemaDocs } from "./build-docs";

// Embeddings
export { generateEmbedding, generateEmbeddings } from "./embeddings";

// Vector client
export {
  getVectorIndex,
  upsertDocuments,
  queryVectors,
  deleteAllDocuments,
  getIndexInfo,
} from "./client";

// Constants
export { RAG_VERSION, RETRIEVAL_CONFIG, KEYWORDS_3D } from "./constants";
