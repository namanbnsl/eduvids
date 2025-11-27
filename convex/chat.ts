import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const createNewChat = mutation({
  args: {
    userEmail: v.string(),
    userId: v.string(),
    title: v.string(),
    created_at: v.number(),
    updated_at: v.number(),
  },
  handler: async (ctx, args) => {
    const chat = {
      userEmail: args.userEmail,
      userId: args.userId,
      title: args.title,
      created_at: args.created_at,
      updated_at: args.updated_at,
      id: crypto.randomUUID(),
    };

    const insertedId = await ctx.db.insert("chats", chat);

    return {
      _id: insertedId,
      ...chat,
    };
  },
});

export const getChatsByUser = query({
  args: { userEmail: v.string() },
  handler: async (ctx, args) => {
    const chats = await ctx.db
      .query("chats")
      .withIndex("by_userEmail_created_at", (q) =>
        q.eq("userEmail", args.userEmail)
      )
      .order("desc")
      .collect();
    return chats;
  },
});

export const deleteChat = mutation({
  args: {
    userEmail: v.string(),
    chatId: v.string(),
  },
  handler: async (ctx, args) => {
    const chat = await ctx.db
      .query("chats")
      .withIndex("by_userEmail_created_at", (q) =>
        q.eq("userEmail", args.userEmail)
      )
      .filter((q) => q.eq(q.field("id"), args.chatId))
      .first();

    if (!chat) {
      return { success: false };
    }

    await ctx.db.delete(chat._id);

    return { success: true };
  },
});

export const updateChatTitle = mutation({
  args: {
    userEmail: v.string(),
    chatId: v.string(),
    title: v.string(),
  },
  handler: async (ctx, args) => {
    const chat = await ctx.db
      .query("chats")
      .withIndex("by_userEmail_created_at", (q) =>
        q.eq("userEmail", args.userEmail)
      )
      .filter((q) => q.eq(q.field("id"), args.chatId))
      .first();

    if (!chat) {
      return { success: false };
    }

    await ctx.db.patch(chat._id, {
      title: args.title,
      updated_at: Date.now(),
    });

    return { success: true };
  },
});
