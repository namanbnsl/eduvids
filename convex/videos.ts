import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getByJobId = query({
  args: { jobId: v.string() },
  handler: async (ctx, args) => {
    const video = await ctx.db
      .query("videos")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .first();
    return video ?? null;
  },
});

export const create = mutation({
  args: {
    jobId: v.string(),
    userId: v.optional(v.string()),
    chatId: v.optional(v.string()),
    description: v.string(),
    variant: v.union(v.literal("video"), v.literal("short")),
  },
  handler: async (ctx, args) => {
    // Check if already exists (idempotent)
    const existing = await ctx.db
      .query("videos")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .first();

    if (existing) {
      return existing._id;
    }

    const now = Date.now();
    const id = await ctx.db.insert("videos", {
      jobId: args.jobId,
      userId: args.userId,
      chatId: args.chatId,
      description: args.description,
      variant: args.variant,
      status: "generating",
      createdAt: now,
      updatedAt: now,
    });

    return id;
  },
});

export const setReady = mutation({
  args: {
    jobId: v.string(),
    videoUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const video = await ctx.db
      .query("videos")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .first();

    if (!video) {
      return null;
    }

    await ctx.db.patch(video._id, {
      status: "ready",
      videoUrl: args.videoUrl,
      updatedAt: Date.now(),
    });

    return video._id;
  },
});

export const setError = mutation({
  args: {
    jobId: v.string(),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const video = await ctx.db
      .query("videos")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .first();

    if (!video) {
      return null;
    }

    await ctx.db.patch(video._id, {
      status: "error",
      error: args.error,
      updatedAt: Date.now(),
    });

    return video._id;
  },
});

export const setYoutubeStatus = mutation({
  args: {
    jobId: v.string(),
    youtubeStatus: v.optional(
      v.union(v.literal("pending"), v.literal("uploaded"), v.literal("failed"))
    ),
    youtubeUrl: v.optional(v.string()),
    youtubeVideoId: v.optional(v.string()),
    youtubeError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const video = await ctx.db
      .query("videos")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .first();

    if (!video) {
      return null;
    }

    const update: Record<string, unknown> = {
      updatedAt: Date.now(),
    };

    if (args.youtubeStatus !== undefined) {
      update.youtubeStatus = args.youtubeStatus;
    }
    if (args.youtubeUrl !== undefined) {
      update.youtubeUrl = args.youtubeUrl;
    }
    if (args.youtubeVideoId !== undefined) {
      update.youtubeVideoId = args.youtubeVideoId;
    }
    if (args.youtubeError !== undefined) {
      update.youtubeError = args.youtubeError;
    }

    await ctx.db.patch(video._id, update);

    return video._id;
  },
});

export const saveCompleted = mutation({
  args: {
    jobId: v.string(),
    userId: v.string(),
    description: v.string(),
    variant: v.union(v.literal("video"), v.literal("short")),
    videoUrl: v.string(),
    youtubeUrl: v.optional(v.string()),
    youtubeVideoId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("videos")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        videoUrl: args.videoUrl,
        status: "ready",
        youtubeStatus: args.youtubeUrl ? "uploaded" : undefined,
        youtubeUrl: args.youtubeUrl,
        youtubeVideoId: args.youtubeVideoId,
        updatedAt: Date.now(),
      });
      return existing._id;
    }

    const now = Date.now();
    const id = await ctx.db.insert("videos", {
      jobId: args.jobId,
      userId: args.userId,
      description: args.description,
      variant: args.variant,
      status: "ready",
      videoUrl: args.videoUrl,
      youtubeStatus: args.youtubeUrl ? "uploaded" : undefined,
      youtubeUrl: args.youtubeUrl,
      youtubeVideoId: args.youtubeVideoId,
      createdAt: now,
      updatedAt: now,
    });

    return id;
  },
});

export const setVoiceoverDraft = mutation({
  args: {
    jobId: v.string(),
    voiceoverDraft: v.string(),
    sources: v.optional(
      v.array(
        v.object({
          title: v.string(),
          url: v.string(),
          content: v.string(),
          score: v.number(),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const video = await ctx.db
      .query("videos")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .first();

    if (!video) {
      return null;
    }

    const update: Record<string, unknown> = {
      voiceoverDraft: args.voiceoverDraft,
      voiceoverStatus: "pending",
      voiceoverUpdatedAt: Date.now(),
      updatedAt: Date.now(),
    };

    if (args.sources !== undefined) {
      update.sources = args.sources;
    }

    await ctx.db.patch(video._id, update);
    return video._id;
  },
});

export const updateVoiceoverDraft = mutation({
  args: {
    jobId: v.string(),
    voiceoverDraft: v.string(),
  },
  handler: async (ctx, args) => {
    const video = await ctx.db
      .query("videos")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .first();

    if (!video) {
      return null;
    }

    if (video.voiceoverStatus === "approved") {
      throw new Error("Cannot edit voiceover after approval");
    }

    await ctx.db.patch(video._id, {
      voiceoverDraft: args.voiceoverDraft,
      voiceoverUpdatedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return video._id;
  },
});

export const approveVoiceover = mutation({
  args: {
    jobId: v.string(),
  },
  handler: async (ctx, args) => {
    const video = await ctx.db
      .query("videos")
      .withIndex("by_jobId", (q) => q.eq("jobId", args.jobId))
      .first();

    if (!video) {
      return { success: false, error: "Video not found" };
    }

    if (!video.voiceoverDraft) {
      return { success: false, error: "No voiceover draft to approve" };
    }

    if (video.voiceoverStatus === "approved") {
      return {
        success: true,
        shouldTrigger: false,
        voiceoverApproved: video.voiceoverApproved,
      };
    }

    const now = Date.now();
    const shouldTrigger = !video.renderContinuationTriggeredAt;

    await ctx.db.patch(video._id, {
      voiceoverApproved: video.voiceoverDraft,
      voiceoverStatus: "approved",
      voiceoverApprovedAt: now,
      renderContinuationTriggeredAt: shouldTrigger ? now : undefined,
      updatedAt: now,
    });

    return {
      success: true,
      shouldTrigger,
      voiceoverApproved: video.voiceoverDraft,
      chatId: video.chatId,
      userId: video.userId,
      description: video.description,
      variant: video.variant,
      sources: video.sources,
    };
  },
});
