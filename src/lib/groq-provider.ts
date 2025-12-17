import { createGroq } from "@ai-sdk/groq";

export const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });

export const selectGroqModel = (modelId: string) => groq(modelId);

export const GROQ_MODEL_IDS = {
  kimiInstruct: "moonshotai/kimi-k2-instruct-0905",
  gptOss: "openai/gpt-oss-120b",
  qwen: "qwen/qwen3-32b",
} as const;
