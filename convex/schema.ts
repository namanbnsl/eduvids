import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  apiKeys: defineTable({
    keyIndex: v.number(),
    provider: v.string(), // "google" | "groq" etc.
    model: v.optional(v.string()), // e.g. "gemini-3-flash-preview"
    status: v.union(
      v.literal("healthy"),
      v.literal("rate_limited"),
      v.literal("quota_exceeded"),
      v.literal("blocked"),
      v.literal("error"),
    ),
    requestCount24h: v.number(),
    windowStartMs: v.number(),
    cooldownUntilMs: v.optional(v.number()),
    quotaResetTimeMs: v.optional(v.number()),
    consecutiveErrors: v.number(),
    successCount: v.number(),
    errorCount: v.number(),
    lastError: v.optional(v.string()),
    lastErrorTimeMs: v.optional(v.number()),
    updatedAtMs: v.number(),
  })
    .index("by_provider_model_keyIndex", ["provider", "model", "keyIndex"])
    .index("by_provider_model", ["provider", "model"])
    .index("by_provider_keyIndex", ["provider", "keyIndex"])
    .index("by_provider", ["provider"]),

  apiKeyManagerState: defineTable({
    provider: v.string(),
    model: v.optional(v.string()),
    lastUsedIndex: v.number(),
    updatedAtMs: v.number(),
  })
    .index("by_provider_model", ["provider", "model"])
    .index("by_provider", ["provider"]),

  chats: defineTable({
    userId: v.string(),
    title: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_updated", ["userId", "updatedAt"]),

  messages: defineTable({
    chatId: v.id("chats"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    parts: v.optional(v.any()),
    createdAt: v.number(),
  })
    .index("by_chat", ["chatId"])
    .index("by_chat_created", ["chatId", "createdAt"]),

  videos: defineTable({
    jobId: v.string(),
    userId: v.optional(v.string()),
    chatId: v.optional(v.string()),
    description: v.string(),
    variant: v.union(v.literal("video"), v.literal("short")),
    status: v.union(
      v.literal("generating"),
      v.literal("ready"),
      v.literal("error"),
    ),
    videoUrl: v.optional(v.string()),
    error: v.optional(v.string()),
    youtubeStatus: v.optional(
      v.union(v.literal("pending"), v.literal("uploaded"), v.literal("failed")),
    ),
    youtubeUrl: v.optional(v.string()),
    youtubeVideoId: v.optional(v.string()),
    youtubeError: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_jobId", ["jobId"])
    .index("by_user_updated", ["userId", "updatedAt"]),
});
