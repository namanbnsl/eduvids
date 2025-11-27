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
  }).index("by_userEmail_created_at", ["userEmail", "created_at"]),
});