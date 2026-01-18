/**
 * Embeddings - Generate embeddings using Google text-embedding-004
 *
 * Uses the same key rotation system as the rest of the app.
 */

import { createGoogleProvider } from "../google-provider";
import { embed, embedMany } from "ai";

const EMBEDDING_MODEL = "text-embedding-004";

export async function generateEmbedding(text: string): Promise<number[]> {
  const provider = createGoogleProvider();
  const { embedding } = await embed({
    model: provider.textEmbeddingModel(EMBEDDING_MODEL),
    value: text,
  });

  return embedding;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) {
    return [];
  }

  // Process in small batches with retry and delay to avoid rate limits
  const BATCH_SIZE = 10;
  const DELAY_BETWEEN_BATCHES_MS = 1000;
  const MAX_RETRIES = 3;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(texts.length / BATCH_SIZE);

    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const provider = createGoogleProvider();
        const { embeddings } = await embedMany({
          model: provider.textEmbeddingModel(EMBEDDING_MODEL),
          values: batch,
        });
        allEmbeddings.push(...embeddings);
        console.log(`   Batch ${batchNum}/${totalBatches} complete`);
        break;
      } catch (err) {
        lastError = err;
        const isRateLimit =
          err instanceof Error &&
          (err.message.includes("429") || err.message.includes("quota"));

        if (isRateLimit && attempt < MAX_RETRIES - 1) {
          const backoffMs = Math.pow(2, attempt + 1) * 10000; // 20s, 40s, 80s
          console.warn(
            `   Rate limited, waiting ${backoffMs / 1000}s before retry...`
          );
          await sleep(backoffMs);
        } else {
          throw err;
        }
      }
    }

    // Delay between batches to avoid hitting rate limits
    if (i + BATCH_SIZE < texts.length) {
      await sleep(DELAY_BETWEEN_BATCHES_MS);
    }
  }

  return allEmbeddings;
}
