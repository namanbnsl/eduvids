export type { ManimGenerationAttempt, ManimGenerationErrorDetails } from "@/lib/llm";

export type VideoVariant = "short" | "video";

export type VideoGenerationPayload = {
  prompt: string;
  userId: string;
  chatId: string;
  jobId?: string;
  variant?: VideoVariant;
};
