/**
 * Retrieve - Tiered retrieval with semantic search and metadata filtering
 */

import type { RagDoc, RagResult, VectorSearchResult } from "./types";
import { queryVectors } from "./client";
import { generateEmbedding } from "./embeddings";
import { inferQueryIntent, shouldIncludeDoc } from "./intent";
import { CORE_SECTION_KEYS, RETRIEVAL_CONFIG } from "./constants";

// In-memory document text cache (populated during indexing or fetched)
const docTextCache = new Map<string, string>();

export function cacheDocText(id: string, text: string): void {
  docTextCache.set(id, text);
}

export function getCachedDocText(id: string): string | undefined {
  return docTextCache.get(id);
}

async function fetchDocText(id: string): Promise<string> {
  const cached = getCachedDocText(id);
  if (cached) return cached;

  // For now, return empty - in production, you'd store text in metadata or separate store
  return "";
}

// Limits no. of examples per schema id (eg. create_cartesian_graph)
// maxPerSchema = 2; [A, A, A, B, B, C] -> [A, A, B, B, C]
function dedupeBySchema(
  results: VectorSearchResult[],
  maxPerSchema: number
): VectorSearchResult[] {
  const schemaCount = new Map<string, number>();
  const deduped: VectorSearchResult[] = [];

  for (const r of results) {
    const schemaId = r.metadata.schemaId ?? "none";
    const count = schemaCount.get(schemaId) ?? 0;

    if (count < maxPerSchema) {
      deduped.push(r);
      schemaCount.set(schemaId, count + 1);
    }
  }

  return deduped;
}

export async function getRagContext(
  userPrompt: string,
  debug = false
): Promise<RagResult> {
  // Step 1: Infer query intent (check for 3D requirement)
  const intent = inferQueryIntent(userPrompt);

  // Step 2: Generate embedding for the query
  const queryEmbedding = await generateEmbedding(userPrompt);

  // Step 3: Query for examples and schemas
  const exampleSchemaResults = await queryVectors({
    embedding: queryEmbedding,
    topK: RETRIEVAL_CONFIG.topK,
    includeMetadata: true,
  });

  // Step 4: Filter results
  const filteredResults = exampleSchemaResults.filter((r) =>
    shouldIncludeDoc(intent, r.metadata.domain, r.metadata.dimension)
  );

  // Step 5: Separate by doc type and dedupe
  const exampleResults = dedupeBySchema(
    filteredResults.filter((r) => r.metadata.docType === "example"),
    RETRIEVAL_CONFIG.examplesPerSchema
  ).slice(0, RETRIEVAL_CONFIG.maxExamples);

  const schemaResults = dedupeBySchema(
    filteredResults.filter((r) => r.metadata.docType === "schema"),
    1
  ).slice(0, RETRIEVAL_CONFIG.maxSchemas);

  // For prompt sections, get core ones always + topic-specific
  const promptResults = filteredResults.filter(
    (r) => r.metadata.docType === "prompt_section"
  );

  const coreSectionResults = promptResults.filter(
    (r) =>
      r.metadata.tier === "core" ||
      (r.metadata.sectionKey &&
        CORE_SECTION_KEYS.includes(r.metadata.sectionKey))
  );

  const topicSectionResults = promptResults
    .filter(
      (r) =>
        r.metadata.tier === "topic" &&
        r.metadata.sectionKey &&
        !CORE_SECTION_KEYS.includes(r.metadata.sectionKey)
    )
    .slice(0, RETRIEVAL_CONFIG.maxTopicSections);

  // Step 6: Build result docs
  const buildDoc = async (r: VectorSearchResult): Promise<RagDoc> => ({
    id: r.id,
    text: await fetchDocText(r.id),
    metadata: r.metadata,
  });

  const [coreSections, schemaDocs, exampleDocs, topicPromptDocs] =
    await Promise.all([
      Promise.all(coreSectionResults.map(buildDoc)),
      Promise.all(schemaResults.map(buildDoc)),
      Promise.all(exampleResults.map(buildDoc)),
      Promise.all(topicSectionResults.map(buildDoc)),
    ]);

  const result: RagResult = {
    coreSections,
    schemaDocs,
    exampleDocs,
    topicPromptDocs,
  };

  if (debug) {
    result.debug = {
      intent,
      hits: filteredResults.map((r) => ({ id: r.id, score: r.score })),
    };
  }

  return result;
}

export function formatRagContext(result: RagResult): string {
  const sections: string[] = [];

  // Core sections (would need actual text - this is a placeholder)
  if (result.coreSections.length > 0) {
    sections.push("=== RAG: CORE MANIM RULES ===");
    sections.push(
      `(${result.coreSections.length} core sections: ${result.coreSections.map((d) => d.metadata.sectionKey).join(", ")})`
    );
  }

  // Schema docs
  if (result.schemaDocs.length > 0) {
    sections.push("\n=== RAG: RELEVANT DIAGRAM SCHEMAS ===");
    for (const doc of result.schemaDocs) {
      sections.push(`\n[Schema: ${doc.metadata.schemaId}]`);
      sections.push(`Helper: ${doc.metadata.manimHelper}()`);
      if (doc.text) {
        sections.push(doc.text);
      }
    }
  }

  // Example docs
  if (result.exampleDocs.length > 0) {
    sections.push("\n=== RAG: VERIFIED EXAMPLES (COPY PATTERNS) ===");
    for (const doc of result.exampleDocs) {
      sections.push(`\n[Example: ${doc.metadata.slug}]`);
      sections.push(`Schema: ${doc.metadata.schemaId}`);
      if (doc.text) {
        sections.push("```python");
        sections.push(doc.text);
        sections.push("```");
      }
    }
  }

  // Topic prompt docs
  if (result.topicPromptDocs.length > 0) {
    sections.push("\n=== RAG: TOPIC-SPECIFIC HELPERS ===");
    for (const doc of result.topicPromptDocs) {
      sections.push(`\n[${doc.metadata.sectionKey}]`);
      if (doc.text) {
        sections.push(doc.text);
      }
    }
  }

  return sections.join("\n");
}
