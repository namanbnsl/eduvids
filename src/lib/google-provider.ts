import {
  createGoogleGenerativeAI,
  type GoogleGenerativeAIProvider,
} from "@ai-sdk/google";
import { ConvexError } from "convex/values";
import { isApiKeyPoolUnavailable, safeError } from "./workflow/errors";
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
  if (!googleApiKeys.length)
    throw new Error("Missing Google Generative AI API keys");
  const convex = getConvexClient();
  // Convex replaces plain error messages with "Server Error" in production;
  // selectKey throws ConvexError so the reason (e.g. every key rate limited)
  // reaches the workflow logs instead.
  const { keyIndex } = await convex
    .mutation(apiKeysApi.selectKey, {
      provider: PROVIDER_NAME,
      model,
      numKeys: googleApiKeys.length,
    })
    .catch((e: unknown) => {
      if (e instanceof ConvexError && typeof e.data === "string")
        throw new Error(`Google API key selection failed: ${e.data}`);
      throw e;
    });

  const apiKey = googleApiKeys[keyIndex];

  if (process.env.DEBUG_API_KEYS === "true") {
    console.log(
      `[Google Provider] Using API key ${keyIndex + 1}/${googleApiKeys.length} `,
    );
  }

  const provider = createGoogleGenerativeAI({ apiKey });
  providerKeyMetadataMap.set(provider, { keyIndex, model });

  return provider;
};

export const GEMINI_HYDROGEN = "gemini-4-hydrogen";
export const GEMINI_FLASH = "gemini-3.8-flash";
export const GEMINI_FLASH_LITE = "gemini-3.5-flash-lite";

/**
 * Ordered models for each kind of work. Every model has its own free daily
 * quota per Cloud project, so a chain both falls back on overload and spreads
 * the scarce requests: Hydrogen (strongest, ~20/day) writes and repairs Manim
 * code, where a mistake costs a whole render; 3.8 Flash (~20/day) writes the
 * narration, plan and titles; Flash-Lite (~500/day) is the last resort.
 */
export const MODEL_CHAINS = {
  code: [GEMINI_HYDROGEN, GEMINI_FLASH, GEMINI_FLASH_LITE],
  writing: [GEMINI_FLASH, GEMINI_HYDROGEN, GEMINI_FLASH_LITE],
} as const;

/** Chains used when a caller names a single model. */
const DEFAULT_CHAINS: Record<string, readonly string[]> = {
  [GEMINI_HYDROGEN]: MODEL_CHAINS.code,
  [GEMINI_FLASH]: [GEMINI_FLASH, GEMINI_FLASH_LITE],
};

export interface GoogleModelConfig {
  modelId: string;
  provider: GoogleGenerativeAIProvider;
  /** Models to try, in order, if this one is overloaded or returns no usable output. */
  fallbacks?: readonly string[];
}

/**
 * Select a key for the first model in the chain whose key pool has capacity.
 * Key selection can fail before a model stream (and its fallback) exists.
 */
export const createGoogleModel = async (
  modelOrChain: string | readonly string[],
): Promise<GoogleModelConfig> => {
  const chain =
    typeof modelOrChain === "string"
      ? (DEFAULT_CHAINS[modelOrChain] ?? [modelOrChain])
      : modelOrChain;
  for (let index = 0; ; index++) {
    const modelId = chain[index]!;
    const fallbacks = chain.slice(index + 1);
    try {
      return {
        modelId,
        provider: await createGoogleProvider(modelId),
        fallbacks,
      };
    } catch (error) {
      if (!fallbacks.length || !isApiKeyPoolUnavailable(error)) throw error;
      console.warn(
        `[Google Provider] ${modelId} key pool unavailable; switching to ${fallbacks[0]}`,
      );
    }
  }
};

/**
 * Report a successful API call (awaited before returning from the serverless invocation)
 */
export const reportSuccess = async (
  provider: GoogleGenerativeAIProvider,
): Promise<void> => {
  const metadata = providerKeyMetadataMap.get(provider);
  if (!metadata) return;

  await getConvexClient()
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
 * Report an API error (awaited before returning from the serverless invocation)
 */
export const reportError = async (
  provider: GoogleGenerativeAIProvider,
  error: unknown,
): Promise<void> => {
  const metadata = providerKeyMetadataMap.get(provider);
  if (!metadata) return;

  const errorMessage = safeError(error);

  await getConvexClient()
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
