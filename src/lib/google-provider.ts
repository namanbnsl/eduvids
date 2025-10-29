import { createGoogleGenerativeAI, type GoogleGenerativeAIProvider } from "@ai-sdk/google";

const GOOGLE_KEY_PREFIX = "GOOGLE_GENERATIVE_AI_API_KEY_";
const BLOCKLIST_DURATION_MS = 60000; // Block rate-limited keys for 60 seconds

const googleApiKeys = Object.entries(process.env)
  .filter(([key, value]) => key.startsWith(GOOGLE_KEY_PREFIX) && typeof value === "string")
  .map(([, value]) => value!.trim())
  .filter((value) => value.length > 0);

if (!googleApiKeys.length) {
  throw new Error(
    "Missing Google Generative AI API keys. Configure GOOGLE_GENERATIVE_AI_API_KEY_1 in the environment."
  );
}

// Track blocked keys with their unblock timestamp
const blockedKeys = new Map<string, number>();

let nextApiKeyIndex = 0;

// Clean up expired blocks
const cleanupBlockedKeys = () => {
  const now = Date.now();
  for (const [key, unblockTime] of blockedKeys.entries()) {
    if (now >= unblockTime) {
      blockedKeys.delete(key);
      console.log(`[Google Provider] API key ${key.slice(0, 8)}... unblocked`);
    }
  }
};

// Check if an error is a rate limit error
const isRateLimitError = (error: any): boolean => {
  if (!error) return false;
  
  const errorMessage = error.message?.toLowerCase() || "";
  const errorString = error.toString().toLowerCase();
  
  // Common rate limit indicators
  return (
    error.status === 429 ||
    error.statusCode === 429 ||
    errorMessage.includes("rate limit") ||
    errorMessage.includes("quota exceeded") ||
    errorMessage.includes("resource exhausted") ||
    errorMessage.includes("too many requests") ||
    errorMessage.includes("overloaded") ||
    errorString.includes("429") ||
    errorString.includes("rate_limit")
  );
};

// Block a key temporarily
const blockKey = (apiKey: string) => {
  const unblockTime = Date.now() + BLOCKLIST_DURATION_MS;
  blockedKeys.set(apiKey, unblockTime);
  console.log(`[Google Provider] API key ${apiKey.slice(0, 8)}... blocked for ${BLOCKLIST_DURATION_MS / 1000}s due to rate limiting`);
};

// Get next available (non-blocked) API key
const getNextApiKey = (): string | null => {
  cleanupBlockedKeys();
  
  const availableKeys = googleApiKeys.filter(key => !blockedKeys.has(key));
  
  if (availableKeys.length === 0) {
    console.warn("[Google Provider] All API keys are currently blocked. Using next key anyway.");
    // If all keys are blocked, clear the blocklist and retry
    blockedKeys.clear();
    return googleApiKeys[nextApiKeyIndex];
  }
  
  // Find next available key starting from current index
  let attempts = 0;
  while (attempts < googleApiKeys.length) {
    const apiKey = googleApiKeys[nextApiKeyIndex];
    nextApiKeyIndex = (nextApiKeyIndex + 1) % googleApiKeys.length;
    
    if (!blockedKeys.has(apiKey)) {
      if (process.env.DEBUG_API_KEYS === "true") {
        console.log(`[Google Provider] Using API key ${apiKey.slice(0, 8)}... (${googleApiKeys.indexOf(apiKey) + 1}/${googleApiKeys.length})`);
      }
      return apiKey;
    }
    
    attempts++;
  }
  
  return null;
};

export const createGoogleProvider = (): GoogleGenerativeAIProvider => {
  const apiKey = getNextApiKey();
  if (!apiKey) {
    throw new Error("No available API keys");
  }
  return createGoogleGenerativeAI({ apiKey });
};

// Retry wrapper with automatic key rotation on rate limit errors
export const withKeyRotation = async <T>(
  fn: (provider: GoogleGenerativeAIProvider) => Promise<T>,
  maxRetries: number = googleApiKeys.length
): Promise<T> => {
  let lastError: any;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const provider = createGoogleProvider();
      const result = await fn(provider);
      return result;
    } catch (error: any) {
      lastError = error;
      
      if (isRateLimitError(error)) {
        // Get the current API key that was just used
        const currentKeyIndex = (nextApiKeyIndex - 1 + googleApiKeys.length) % googleApiKeys.length;
        const failedKey = googleApiKeys[currentKeyIndex];
        
        blockKey(failedKey);
        
        console.log(`[Google Provider] Rate limit hit, retrying with next key (attempt ${attempt + 1}/${maxRetries})`);
        
        // If we have more keys to try, continue
        if (attempt < maxRetries - 1) {
          continue;
        }
      } else {
        // For non-rate-limit errors, throw immediately
        throw error;
      }
    }
  }
  
  console.error(`[Google Provider] All retry attempts failed`);
  throw lastError;
};

// Export info about the key pool for debugging
export const getKeyPoolInfo = () => ({
  totalKeys: googleApiKeys.length,
  currentIndex: nextApiKeyIndex,
  hasMultipleKeys: googleApiKeys.length > 1,
  blockedKeys: Array.from(blockedKeys.keys()).map(k => k.slice(0, 8) + "..."),
  availableKeys: googleApiKeys.length - blockedKeys.size,
});
