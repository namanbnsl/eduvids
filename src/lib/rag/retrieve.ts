/**
 * Retrieve - Semantic search for relevant diagram examples and schemas
 *
 * Returns the most relevant examples and schemas based on the user's prompt.
 * The full system prompt is always included separately - RAG only adds
 * topic-specific illustrations and schema docs.
 */

import type { RagDoc, RagResult, VectorSearchResult } from "./types";
import { queryVectors } from "./client";
import { generateEmbedding } from "./embeddings";
import { inferQueryIntent, shouldIncludeDoc } from "./intent";
import { RETRIEVAL_CONFIG } from "./constants";

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
  // Step 1: Infer query intent (only for 3D filtering)
  const intent = inferQueryIntent(userPrompt);

  // Step 2: Generate embedding for the query
  const queryEmbedding = await generateEmbedding(userPrompt);

  // Step 3: Query vector store
  const searchResults = await queryVectors({
    embedding: queryEmbedding,
    topK: RETRIEVAL_CONFIG.topK,
    includeMetadata: true,
  });

  // Step 4: Filter results (only 3D exclusion)
  const filteredResults = searchResults.filter((r) =>
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

  // Step 6: Build result docs with text from metadata
  const buildDoc = (r: VectorSearchResult): RagDoc => ({
    id: r.id,
    text: r.metadata.text ?? "",
    metadata: r.metadata,
  });

  const result: RagResult = {
    coreSections: [], // No longer used - system prompt is separate
    schemaDocs: schemaResults.map(buildDoc),
    exampleDocs: exampleResults.map(buildDoc),
    topicPromptDocs: [], // No longer used
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

  // Schema docs - show relevant diagram helpers
  if (result.schemaDocs.length > 0) {
    sections.push("═══════════════════════════════════════════════════════════════════════════════");
    sections.push("RELEVANT DIAGRAM SCHEMAS FOR THIS TOPIC");
    sections.push("═══════════════════════════════════════════════════════════════════════════════");
    sections.push("");
    for (const doc of result.schemaDocs) {
      if (doc.text) {
        sections.push(doc.text);
        sections.push("");
      }
    }
  }

  // Example docs - show verified code examples
  if (result.exampleDocs.length > 0) {
    sections.push("═══════════════════════════════════════════════════════════════════════════════");
    sections.push("VERIFIED EXAMPLES - COPY THESE PATTERNS");
    sections.push("═══════════════════════════════════════════════════════════════════════════════");
    sections.push("");
    for (const doc of result.exampleDocs) {
      sections.push(`# Example: ${doc.metadata.slug ?? doc.id}`);
      sections.push(`# Schema: ${doc.metadata.schemaId}`);
      if (doc.text) {
        // Extract just the code part if it contains the full text
        const codeMatch = doc.text.match(/Code:\n([\s\S]+)$/);
        if (codeMatch) {
          sections.push(codeMatch[1].trim());
        } else {
          sections.push(doc.text);
        }
      }
      sections.push("");
    }
  }

  return sections.join("\n");
}
