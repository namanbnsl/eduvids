#!/usr/bin/env tsx
/**
 * RAG Indexing Script
 *
 * Builds documents from diagram examples, schemas, and prompt sections,
 * generates embeddings, and upserts to Upstash Vector.
 *
 * Usage:
 *   bun tsx scripts/index-rag.ts
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
  const requiredEnvVars = [
    "UPSTASH_VECTOR_REST_URL",
    "UPSTASH_VECTOR_REST_TOKEN",
    "GOOGLE_GENERATIVE_AI_API_KEY",
  ];

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      console.error(`❌ Missing required environment variable: ${envVar}`);
      process.exit(1);
    }
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
    `   Generated ${embeddings.length} embeddings in ${embeddingTime}s`
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
    {} as Record<string, number>
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
