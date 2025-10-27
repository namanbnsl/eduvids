import { createGoogleGenerativeAI, type GoogleGenerativeAIProvider } from "@ai-sdk/google";

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

let nextApiKeyIndex = 0;

const getNextApiKey = () => {
  const apiKey = googleApiKeys[nextApiKeyIndex];
  const currentIndex = nextApiKeyIndex;
  nextApiKeyIndex = (nextApiKeyIndex + 1) % googleApiKeys.length;
  
  // Optional debug logging (only if DEBUG_API_KEYS is set)
  if (process.env.DEBUG_API_KEYS === "true") {
    console.log(`[Google Provider] Using API key ${currentIndex + 1}/${googleApiKeys.length} (${apiKey.slice(0, 8)}...)`);
  }
  
  return apiKey;
};

export const createGoogleProvider = (): GoogleGenerativeAIProvider => {
  const apiKey = getNextApiKey();
  return createGoogleGenerativeAI({ apiKey });
};

// Export info about the key pool for debugging
export const getKeyPoolInfo = () => ({
  totalKeys: googleApiKeys.length,
  currentIndex: nextApiKeyIndex,
  hasMultipleKeys: googleApiKeys.length > 1,
});
