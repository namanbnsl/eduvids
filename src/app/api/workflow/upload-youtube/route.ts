import { WorkflowNonRetryableError } from "@upstash/workflow";
import { safeError } from "@/lib/workflow/errors";
import { serve } from "@upstash/workflow/nextjs";

import {
  addVideoToPlaylist,
  findPreviousYouTubeVideo,
  postYouTubeComment,
  setYouTubeThumbnail,
  uploadToYouTube,
} from "@/lib/youtube";
import {
  buildPreviousVideoComment,
  buildYouTubeDescription,
  type RelatedYouTubeVideo,
} from "@/lib/youtube-metadata";
import { jobStore, artifactStore } from "@/lib/job-store";
import { getConvexClient, api } from "@/lib/convex-server";
import { qstashClientWithBypass } from "@/lib/workflow/client";

import type { VideoVariant } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

type YouTubeUploadPayload = {
  videoUrl: string;
  title?: string;
  description?: string;
  prompt: string;
  jobId?: string;
  userId: string;
  variant?: VideoVariant;
  thumbnailUrl?: string;
};

export const { POST } = serve<YouTubeUploadPayload>(
  async (context) => {
    const {
      videoUrl,
      title,
      description,
      prompt,
      jobId,
      variant,
      thumbnailUrl,
    } = context.requestPayload;

    const isShort = variant === "short";
    const tags = [
      "education",
      "manim",
      "math",
      "science",
      ...(isShort ? ["shorts", "vertical"] : []),
    ];
    const key = jobId ?? context.workflowRunId;

    const previousVideo = await context.run(
      "find-previous-youtube-video",
      async () => {
        const saved = await artifactStore.find(key, "previousYoutubeVideo");
        if (saved) {
          return JSON.parse(saved) as RelatedYouTubeVideo | null;
        }

        try {
          const result = await findPreviousYouTubeVideo();
          await artifactStore.set(
            key,
            "previousYoutubeVideo",
            JSON.stringify(result ?? null),
          );
          return result ?? null;
        } catch (error) {
          console.warn(
            "Previous-video lookup failed; continuing without a link:",
            safeError(error),
          );
          return null;
        }
      },
    );

    const finalDescription = buildYouTubeDescription({
      salesCopy: description,
      topic: prompt,
      previousVideo: previousVideo ?? undefined,
    });

    const youtubeResult = await context.run("upload-to-youtube", async () => {
      const saved = await artifactStore.find(key, "youtubeResult");
      if (saved)
        return JSON.parse(saved) as Awaited<ReturnType<typeof uploadToYouTube>>;
      // YouTube insert has no idempotency key. Never duplicate a possibly accepted upload.
      if (!(await artifactStore.claim(key, "youtubeUploadStarted"))) {
        throw new WorkflowNonRetryableError(
          "YouTube upload outcome is unknown; check the channel before retrying",
        );
      }
      try {
        const result = await uploadToYouTube({
          videoUrl,
          title: title ?? prompt.slice(0, 100),
          description: finalDescription,
          tags,
          variant,
        });
        await artifactStore.set(key, "youtubeResult", JSON.stringify(result));
        return result;
      } catch (error) {
        throw new WorkflowNonRetryableError(
          `YouTube upload could not be confirmed: ${safeError(error)}`,
        );
      }
    });

    if (thumbnailUrl) {
      await context.run("set-youtube-thumbnail", async () => {
        const saved = await artifactStore.find(key, "youtubeThumbnailResult");
        if (saved) return JSON.parse(saved);
        try {
          await setYouTubeThumbnail({
            videoId: youtubeResult.videoId,
            thumbnailUrl,
          });
          const result = { success: true };
          await artifactStore.set(
            key,
            "youtubeThumbnailResult",
            JSON.stringify(result),
          );
          return result;
        } catch (error) {
          const result = { error: safeError(error) };
          console.warn(
            "Custom thumbnail failed; upload remains successful:",
            result.error,
          );
          await artifactStore.set(
            key,
            "youtubeThumbnailResult",
            JSON.stringify(result),
          );
          return result;
        }
      });
    }

    if (jobId) {
      await context.run("update-job-youtube-status", async () => {
        await jobStore.setYoutubeStatus(jobId, {
          youtubeStatus: "uploaded",
          youtubeUrl: youtubeResult.watchUrl,
          youtubeVideoId: youtubeResult.videoId,
          youtubeError: undefined,
        });
      });

      const { userId } = context.requestPayload;
      if (userId) {
        await context.run("save-to-convex", async () => {
          await getConvexClient().mutation(api.videos.saveCompleted, {
            jobId,
            userId,
            description: prompt,
            variant: variant ?? "video",
            videoUrl,
            youtubeUrl: youtubeResult.watchUrl,
            youtubeVideoId: youtubeResult.videoId,
          });
        });
      }
    }

    if (previousVideo) {
      await context.run("comment-previous-youtube-video", async () => {
        if (await artifactStore.find(key, "youtubeCommentResult")) return;
        if (!(await artifactStore.claim(key, "youtubeCommentStarted"))) return;

        try {
          const result = await postYouTubeComment({
            videoId: youtubeResult.videoId,
            text: buildPreviousVideoComment(previousVideo),
          });
          await artifactStore.set(
            key,
            "youtubeCommentResult",
            JSON.stringify(result),
          );
        } catch (error) {
          console.warn(
            "Previous-video comment failed; upload remains successful:",
            safeError(error),
          );
          await artifactStore.set(
            key,
            "youtubeCommentResult",
            JSON.stringify({ error: safeError(error) }),
          );
        }
      });
    }

    const playlistId = process.env.YOUTUBE_PLAYLIST_ID?.trim();
    if (playlistId) {
      await context.run("add-youtube-playlist-item", async () => {
        const saved = await artifactStore.find(key, "youtubePlaylistResult");
        if (saved) return JSON.parse(saved);

        try {
          const result = await addVideoToPlaylist({
            videoId: youtubeResult.videoId,
            playlistId,
          });
          await artifactStore.set(
            key,
            "youtubePlaylistResult",
            JSON.stringify(result),
          );
          return result;
        } catch (error) {
          const result = { error: safeError(error) };
          console.warn(
            "Playlist insertion failed; upload remains successful:",
            result.error,
          );
          await artifactStore.set(
            key,
            "youtubePlaylistResult",
            JSON.stringify(result),
          );
          return result;
        }
      });
    }

    return { success: true, ...youtubeResult };
  },
  {
    retries: 3,
    qstashClient: qstashClientWithBypass,
    failureFunction: async ({ context, failResponse }) => {
      const { jobId } = context.requestPayload;
      console.error("YouTube upload workflow failed:", safeError(failResponse));

      if (jobId && (await jobStore.get(jobId))?.youtubeStatus !== "uploaded") {
        await jobStore.setYoutubeStatus(jobId, {
          youtubeStatus: "failed",
          youtubeError:
            "YouTube upload could not be confirmed. Check the channel before retrying.",
        });
      }
    },
  },
);
