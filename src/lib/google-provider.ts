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

const getRandomApiKey = () =>
  googleApiKeys[Math.floor(Math.random() * googleApiKeys.length)];

export const createGoogleProvider = (): GoogleGenerativeAIProvider => {
  const apiKey = getRandomApiKey();
  return createGoogleGenerativeAI({ apiKey });
};
