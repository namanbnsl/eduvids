import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: { chatId: v.id("chats") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }

    // Verify user owns this chat
    const chat = await ctx.db.get(args.chatId);
    if (!chat || chat.userId !== identity.subject) {
      return [];
    }

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_chat_created", (q) => q.eq("chatId", args.chatId))
      .order("asc")
      .collect();

    return messages;
  },
});

export const create = mutation({
  args: {
    chatId: v.id("chats"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    parts: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated");
    }

    // Verify user owns this chat
    const chat = await ctx.db.get(args.chatId);
    if (!chat || chat.userId !== identity.subject) {
      throw new Error("Chat not found");
    }

    const messageId = await ctx.db.insert("messages", {
      chatId: args.chatId,
      role: args.role,
      content: args.content,
      parts: args.parts,
      createdAt: Date.now(),
    });

    // Update chat's updatedAt
    await ctx.db.patch(args.chatId, {
      updatedAt: Date.now(),
    });

    return messageId;
  },
});

export const updateParts = mutation({
  args: {
    id: v.id("messages"),
    parts: v.any(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated");
    }

    const message = await ctx.db.get(args.id);
    if (!message) {
      throw new Error("Message not found");
    }

    // Verify user owns this chat
    const chat = await ctx.db.get(message.chatId);
    if (!chat || chat.userId !== identity.subject) {
      throw new Error("Message not found");
    }

    await ctx.db.patch(args.id, {
      parts: args.parts,
    });
  },
});
