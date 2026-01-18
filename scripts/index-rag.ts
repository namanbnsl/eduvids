#!/usr/bin/env tsx

/**
 * RAG Indexing Script
 *
 * Builds documents from diagram examples and schemas,
 * generates embeddings, and upserts to Upstash Vector.
 *
 * Usage:
 *   bun run rag:index        # Index all documents
 *   bun run rag:reset        # Reset and re-index
 *
 * Environment variables required:
 *   - UPSTASH_VECTOR_REST_URL
 *   - UPSTASH_VECTOR_REST_TOKEN
 *   - GOOGLE_GENERATIVE_AI_API_KEY (or GOOGLE_GENERATIVE_AI_API_KEY_1)
 */

import * as path from "path";
import * as dotenv from "dotenv";

// Load environment variables
dotenv.config();

import { buildAllDocs } from "../src/lib/rag/build-docs";
import { generateEmbeddings } from "../src/lib/rag/embeddings";
import {
  upsertDocuments,
  getIndexInfo,
  deleteAllDocuments,
} from "../src/lib/rag/client";
import { cacheDocText } from "../src/lib/rag/retrieve";

async function main() {
  const args = process.argv.slice(2);
  const shouldReset = args.includes("--reset");

  console.log("🚀 Starting RAG indexing...\n");

  // Check environment
  if (
    !process.env.UPSTASH_VECTOR_REST_URL ||
    !process.env.UPSTASH_VECTOR_REST_TOKEN
  ) {
    console.error(
      "❌ Missing UPSTASH_VECTOR_REST_URL or UPSTASH_VECTOR_REST_TOKEN",
    );
    process.exit(1);
  }

  // Check for Google API key (supports both naming conventions)
  const hasGoogleKey =
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY_1;
  if (!hasGoogleKey) {
    console.error(
      "❌ Missing GOOGLE_GENERATIVE_AI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY_1",
    );
    process.exit(1);
  }

  // Get docs directory
  const docsDir = path.resolve(process.cwd(), "docs");
  console.log(`📁 Docs directory: ${docsDir}`);

  // Reset index if requested
  if (shouldReset) {
    console.log("\n⚠️  Resetting index (--reset flag)...");
    await deleteAllDocuments();
    console.log("✅ Index reset complete");
  }

  // Build documents
  console.log("\n📝 Building documents...");
  const docs = buildAllDocs(docsDir);
  console.log(`   Total documents: ${docs.length}`);

  if (docs.length === 0) {
    console.error("❌ No documents built. Check your docs directory.");
    process.exit(1);
  }

  // Cache document texts for retrieval
  for (const doc of docs) {
    cacheDocText(doc.id, doc.text);
  }

  // Generate embeddings
  console.log("\n🧠 Generating embeddings...");
  const texts = docs.map((d) => d.text);

  const startTime = Date.now();
  const embeddings = await generateEmbeddings(texts);
  const embeddingTime = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log(
    `   Generated ${embeddings.length} embeddings in ${embeddingTime}s`,
  );
  console.log(`   Embedding dimension: ${embeddings[0]?.length ?? "unknown"}`);

  // Upsert to Upstash
  console.log("\n⬆️  Upserting to Upstash Vector...");
  const upsertStart = Date.now();
  await upsertDocuments({ docs, embeddings });
  const upsertTime = ((Date.now() - upsertStart) / 1000).toFixed(2);
  console.log(`   Upserted ${docs.length} vectors in ${upsertTime}s`);

  // Verify index
  console.log("\n📊 Index info:");
  const info = await getIndexInfo();
  console.log(`   Vector count: ${info.vectorCount}`);
  console.log(`   Dimension: ${info.dimension}`);

  // Print document breakdown
  console.log("\n📋 Document breakdown:");
  const byType = docs.reduce(
    (acc, d) => {
      acc[d.metadata.docType] = (acc[d.metadata.docType] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  for (const [type, count] of Object.entries(byType)) {
    console.log(`   ${type}: ${count}`);
  }

  console.log("\n✅ RAG indexing complete!");
}

main().catch((error) => {
  console.error("❌ Indexing failed:", error);
  process.exit(1);
});
