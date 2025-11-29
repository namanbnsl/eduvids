import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const saveMessage = mutation({
  args: {
    chatId: v.string(),
    content: v.string(),
    role: v.union(v.literal("user"), v.literal("assistant")),
    jobId: v.optional(v.string()),
    toolInvocations: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated call to saveMessage");
    }

    const chat = await ctx.db
      .query("chats")
      .withIndex("by_public_id", (q) => q.eq("id", args.chatId))
      .unique();

    if (!chat) {
      throw new Error("Chat not found");
    }

    if (chat.userEmail !== identity.email) {
      throw new Error("Unauthorized: Chat does not belong to user");
    }

    await ctx.db.insert("messages", {
      chatId: args.chatId,
      content: args.content,
      role: args.role,
      jobId: args.jobId,
      toolInvocations: args.toolInvocations,
      created_at: Date.now(),
    });
  },
});

export const getMessages = query({
  args: { chatId: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    const chat = await ctx.db
      .query("chats")
      .withIndex("by_public_id", (q) => q.eq("id", args.chatId))
      .unique();

    if (!chat) {
      return [];
    }

    if (chat.userEmail !== identity.email) {
      return [];
    }

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .collect();
    return messages;
  },
});
