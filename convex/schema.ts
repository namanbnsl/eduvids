import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
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
    description: v.string(),
    variant: v.union(v.literal("video"), v.literal("short")),
    status: v.union(
      v.literal("generating"),
      v.literal("ready"),
      v.literal("error")
    ),
    videoUrl: v.optional(v.string()),
    error: v.optional(v.string()),
    youtubeStatus: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("uploaded"),
        v.literal("failed")
      )
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
