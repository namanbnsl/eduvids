import { createGoogleGenerativeAI, type GoogleGenerativeAIProvider } from "@ai-sdk/google";
import { GoogleKeyHealthManager, KeyStatus } from "./google-key-manager";

const GOOGLE_KEY_PREFIX = "GOOGLE_GENERATIVE_AI_API_KEY_";

const googleApiKeys = Object.entries(process.env)
  .filter(([key, value]) => key.startsWith(GOOGLE_KEY_PREFIX) && typeof value === "string")
  .map(([, value]) => value!.trim())
  .filter((value) => value.length > 0);

if (!googleApiKeys.length) {
  throw new Error(
    "Missing Google Generative AI API keys. Configure GOOGLE_GENERATIVE_AI_API_KEY_1 in the environment."
  );
}

// Initialize the key health manager
const keyManager = new GoogleKeyHealthManager(googleApiKeys);

// Track which key was used for each provider instance to report success/errors
const providerKeyMap = new WeakMap<GoogleGenerativeAIProvider, string>();

const getNextApiKey = () => {
  const selection = keyManager.selectKey();
  
  // Optional debug logging (only if DEBUG_API_KEYS is set)
  if (process.env.DEBUG_API_KEYS === "true") {
    console.log(
      `[Google Provider] Using API key ${selection.index + 1}/${googleApiKeys.length} ` +
      `(${selection.key.slice(0, 8)}...) - Status: ${selection.health.status}`
    );
  }
  
  return selection.key;
};

export const createGoogleProvider = (): GoogleGenerativeAIProvider => {
  const apiKey = getNextApiKey();
  const provider = createGoogleGenerativeAI({ apiKey });
  
  // Store the key associated with this provider for error reporting
  providerKeyMap.set(provider, apiKey);
  
  return provider;
};

/**
 * Report a successful API call (call this after successful generation)
 */
export const reportSuccess = (provider: GoogleGenerativeAIProvider): void => {
  const apiKey = providerKeyMap.get(provider);
  if (apiKey) {
    keyManager.reportSuccess(apiKey);
  }
};

/**
 * Report an API error (call this when generation fails)
 */
export const reportError = (provider: GoogleGenerativeAIProvider, error: unknown): void => {
  const apiKey = providerKeyMap.get(provider);
  if (apiKey) {
    keyManager.reportError(apiKey, error);
  }
};

/**
 * Manually mark a specific API key as blocked
 */
export const markKeyBlocked = (keyIndex: number): void => {
  if (keyIndex >= 0 && keyIndex < googleApiKeys.length) {
    keyManager.markKeyBlocked(googleApiKeys[keyIndex]);
  }
};

/**
 * Manually mark a specific API key as healthy
 */
export const markKeyHealthy = (keyIndex: number): void => {
  if (keyIndex >= 0 && keyIndex < googleApiKeys.length) {
    keyManager.markKeyHealthy(googleApiKeys[keyIndex]);
  }
};

/**
 * Reset all keys to healthy state
 */
export const resetAllKeys = (): void => {
  keyManager.resetAllKeys();
};

/**
 * Get current health status of all keys
 */
export const getKeyHealthStatus = () => {
  return keyManager.getHealthStatus();
};

/**
 * Get statistics about key usage
 */
export const getKeyStats = () => {
  return keyManager.getStats();
};

/**
 * Print detailed health report to console
 */
export const printHealthReport = (): void => {
  keyManager.printHealthReport();
};

// Export info about the key pool for debugging
export const getKeyPoolInfo = () => {
  const stats = keyManager.getStats();
  return {
    totalKeys: googleApiKeys.length,
    hasMultipleKeys: googleApiKeys.length > 1,
    healthyKeys: stats.healthy,
    blockedKeys: stats.blocked,
    rateLimitedKeys: stats.rateLimited,
    quotaExceededKeys: stats.quotaExceeded,
    totalSuccesses: stats.totalSuccesses,
    totalErrors: stats.totalErrors,
  };
};
