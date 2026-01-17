/**
 * RAG Module - Main exports for diagram retrieval augmented generation
 *
 * This module provides smart retrieval of diagram examples, schemas, and
 * Manim helper documentation based on user prompts.
 *
 * Usage:
 *   import { getRagContext, formatRagContext } from "@/lib/rag";
 *
 *   const context = await getRagContext("Why does carbon form allotropes?");
 *   const contextString = formatRagContext(context);
 *   // Inject contextString into LLM prompt
 */

// Types
export type {
  RagDoc,
  RagDocType,
  RagMetadata,
  RagResult,
  RagDomain,
  RagTier,
  QueryIntent,
  VectorSearchResult,
} from "./types";

// Retrieval (main API)
export { getRagContext, formatRagContext, cacheDocText } from "./retrieve";

// Intent inference
export { inferQueryIntent, shouldIncludeDoc } from "./intent";

// Document building (for indexing)
export {
  buildAllDocs,
  buildExampleDocs,
  buildSchemaDocs,
  buildPromptSectionDocs,
} from "./build-docs";

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
export {
  RAG_VERSION,
  CORE_SECTION_KEYS,
  RETRIEVAL_CONFIG,
  KEYWORDS_3D,
} from "./constants";
