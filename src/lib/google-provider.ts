import {
  createGoogleGenerativeAI,
  type GoogleGenerativeAIProvider,
} from "@ai-sdk/google";
import { getConvexClient, api } from "./convex-server";

const GOOGLE_KEY_PREFIX = "GOOGLE_GENERATIVE_AI_API_KEY_";
const PROVIDER_NAME = "google";
const apiKeysApi = api.apiKeys;

const googleApiKeys = Object.entries(process.env)
  .filter(
    ([key, value]) =>
      key.startsWith(GOOGLE_KEY_PREFIX) && typeof value === "string",
  )
  .map(([, value]) => value!.trim())
  .filter((value) => value.length > 0);

if (!googleApiKeys.length) {
  throw new Error(
    "Missing Google Generative AI API keys. Configure GOOGLE_GENERATIVE_AI_API_KEY_1 in the environment.",
  );
}

// Track which key/model was used for each provider instance.
const providerKeyMetadataMap = new WeakMap<
  GoogleGenerativeAIProvider,
  { keyIndex: number; model: string }
>();

/**
 * Create a Google provider using the best available API key from the database.
 * This is async because it queries the Convex database for key selection.
 */
export const createGoogleProvider = async (
  model: string,
): Promise<GoogleGenerativeAIProvider> => {
  const convex = getConvexClient();
  const { keyIndex } = await convex.mutation(apiKeysApi.selectKey, {
    provider: PROVIDER_NAME,
    model,
    numKeys: googleApiKeys.length,
  });

  const apiKey = googleApiKeys[keyIndex];

  if (process.env.DEBUG_API_KEYS === "true") {
    console.log(
      `[Google Provider] Using API key ${keyIndex + 1}/${googleApiKeys.length} ` +
        `(${apiKey.slice(0, 8)}...)`,
    );
  }

  const provider = createGoogleGenerativeAI({ apiKey });
  providerKeyMetadataMap.set(provider, { keyIndex, model });

  return provider;
};

/**
 * Report a successful API call (fire-and-forget)
 */
export const reportSuccess = (provider: GoogleGenerativeAIProvider): void => {
  const metadata = providerKeyMetadataMap.get(provider);
  if (!metadata) return;

  void getConvexClient()
    .mutation(apiKeysApi.reportSuccess, {
      provider: PROVIDER_NAME,
      model: metadata.model,
      keyIndex: metadata.keyIndex,
    })
    .catch((e: unknown) =>
      console.warn("[Google Provider] reportSuccess failed", e),
    );
};

/**
 * Report an API error (fire-and-forget)
 */
export const reportError = (
  provider: GoogleGenerativeAIProvider,
  error: unknown,
): void => {
  const metadata = providerKeyMetadataMap.get(provider);
  if (!metadata) return;

  const errorMessage = error instanceof Error ? error.message : String(error);

  void getConvexClient()
    .mutation(apiKeysApi.reportError, {
      provider: PROVIDER_NAME,
      model: metadata.model,
      keyIndex: metadata.keyIndex,
      errorMessage,
    })
    .catch((e: unknown) =>
      console.warn("[Google Provider] reportError failed", e),
    );
};

/**
 * Get current health status of all keys
 */
export const getKeyHealthStatus = async (model: string) => {
  return getConvexClient().query(apiKeysApi.getHealthStatus, {
    provider: PROVIDER_NAME,
    model,
  });
};

/**
 * Reset all keys to healthy state
 */
export const resetAllKeys = async (model: string): Promise<void> => {
  await getConvexClient().mutation(apiKeysApi.resetAllKeys, {
    provider: PROVIDER_NAME,
    model,
  });
};

// Export info about the key pool for debugging
export const getKeyPoolInfo = async (model: string) => {
  const keys = await getKeyHealthStatus(model);
  const stats = {
    totalKeys: googleApiKeys.length,
    hasMultipleKeys: googleApiKeys.length > 1,
    healthy: 0,
    blocked: 0,
    rateLimited: 0,
    quotaExceeded: 0,
    totalSuccesses: 0,
    totalErrors: 0,
  };

  for (const key of keys) {
    stats.totalSuccesses += key.successCount;
    stats.totalErrors += key.errorCount;
    switch (key.status) {
      case "healthy":
        stats.healthy++;
        break;
      case "blocked":
        stats.blocked++;
        break;
      case "rate_limited":
        stats.rateLimited++;
        break;
      case "quota_exceeded":
        stats.quotaExceeded++;
        break;
    }
  }

  return stats;
};
