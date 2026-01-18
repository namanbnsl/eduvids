/**
 * RAG Types - Document models and metadata schemas for Upstash Vector
 */

export type RagDocType = "example" | "schema";
export type RagDomain =
  | "chemistry"
  | "physics"
  | "math"
  | "cs"
  | "bio"
  | "general";
export type DiagramDimension = "2d" | "3d";

export interface RagMetadata {
  docType: RagDocType;

  // Topical routing (used by embeddings)
  topicTags: string[];
  domain?: RagDomain;

  // Diagram fields
  schemaId?: string;
  diagramType?: string;
  dimension?: DiagramDimension;
  manimHelper?: string;

  // Provenance
  sourcePath: string;
  slug?: string;
  version: string;

  // Document content (stored in vector DB for retrieval)
  text?: string;
}

export interface RagDoc {
  id: string;
  text: string;
  metadata: RagMetadata;
}

export interface QueryIntent {
  allow3d: boolean;
}

export interface RagResult {
  coreSections: RagDoc[]; // Kept for API compatibility, always empty
  schemaDocs: RagDoc[];
  exampleDocs: RagDoc[];
  topicPromptDocs: RagDoc[]; // Kept for API compatibility, always empty
  debug?: {
    intent: QueryIntent;
    hits: Array<{ id: string; score: number }>;
  };
}

export interface VectorSearchResult {
  id: string;
  score: number;
  metadata: RagMetadata;
}
