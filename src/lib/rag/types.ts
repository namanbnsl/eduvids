/**
 * RAG Types - Document models and metadata schemas for Upstash Vector
 */

import { DiagramDimension } from "@/lib/diagram-schemas";

export type RagDocType = "example" | "schema" | "prompt_section";
export type RagDomain =
  | "chemistry"
  | "physics"
  | "math"
  | "cs"
  | "bio"
  | "general";
export type RagTier = "core" | "topic";

export interface RagMetadata {
  docType: RagDocType;

  // Topical routing
  topicTags: string[];
  domain?: RagDomain;

  // Diagram-specific fields
  schemaId?: string;
  diagramType?: string;
  dimension?: DiagramDimension;
  manimHelper?: string;

  // Prompt-section specific
  sectionKey?: string;
  tier?: RagTier;

  // Provenance / debugging
  sourcePath: string;
  slug?: string;
  version: string;
}

export interface RagDoc {
  id: string;
  text: string;
  metadata: RagMetadata;
}

export interface QueryIntent {
  allow3d: boolean;
  // includeSchemaIds?: string[];
}

export interface RagResult {
  coreSections: RagDoc[];
  schemaDocs: RagDoc[];
  exampleDocs: RagDoc[];
  topicPromptDocs: RagDoc[];
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
