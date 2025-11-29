import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  chats: defineTable({
    userEmail: v.string(),
    userId: v.string(),
    title: v.string(),
    created_at: v.number(),
    updated_at: v.number(),
    id: v.string(),
  })
    .index("by_userEmail_created_at", ["userEmail", "created_at"])
    .index("by_public_id", ["id"]),
  messages: defineTable({
    chatId: v.string(),
    content: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant")),
    jobId: v.optional(v.string()),
    toolInvocations: v.optional(v.string()),
    created_at: v.number(),
  }).index("by_chatId", ["chatId"]),
});
