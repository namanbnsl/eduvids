import { serve } from "@upstash/workflow/nextjs";

import { uploadToYouTube, setYouTubeThumbnail } from "@/lib/youtube";
import { jobStore } from "@/lib/job-store";
import { getConvexClient, api } from "@/lib/convex-server";
import {
  workflowClient,
  getBaseUrl,
  qstashClientWithBypass,
  getTriggerHeaders,
} from "@/lib/workflow/client";

import type { VideoVariant } from "@/lib/types";

export const runtime = "nodejs";

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
    const { videoUrl, title, description, prompt, jobId, variant, thumbnailUrl } =
      context.requestPayload;

    const isShort = variant === "short";
    const tags = [
      "education",
      "manim",
      "math",
      "science",
      ...(isShort ? ["shorts", "vertical"] : []),
    ];

    const youtubeResult = await context.run("upload-to-youtube", async () => {
      return uploadToYouTube({
        videoUrl,
        title: title ?? prompt.slice(0, 100),
        description,
        tags,
        variant,
      });
    });

    // Set custom thumbnail (best-effort, no try/catch around context.run)
    if (thumbnailUrl) {
      await context.run("set-youtube-thumbnail", async () => {
        try {
          await setYouTubeThumbnail({
            videoId: youtubeResult.videoId,
            thumbnailUrl,
          });
          console.log("✅ YouTube thumbnail set");
        } catch (err) {
          console.warn("YouTube thumbnail set failed (non-fatal):", err);
        }
      });
    }

    // Trigger X (Twitter) post workflow
    await context.run("trigger-x-upload", async () => {
      await workflowClient.trigger({
        headers: getTriggerHeaders(),
        url: `${getBaseUrl()}/api/workflow/upload-x`,
        body: {
          videoUrl: youtubeResult.watchUrl,
          title: youtubeResult.title,
        },
      });
    });

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
          try {
            await getConvexClient().mutation(api.videos.saveCompleted, {
              jobId,
              userId,
              description: prompt,
              variant: variant ?? "video",
              videoUrl,
              youtubeUrl: youtubeResult.watchUrl,
              youtubeVideoId: youtubeResult.videoId,
            });
          } catch (err) {
            console.error("[workflow] Failed to save video to Convex:", err);
          }
        });
      }
    }

    return { success: true, ...youtubeResult };
  },
  {
    retries: 0,
    qstashClient: qstashClientWithBypass,
    failureFunction: async ({ context, failResponse }) => {
      const { jobId } = context.requestPayload;
      console.error("YouTube upload workflow failed:", failResponse);

      if (jobId) {
        await jobStore.setYoutubeStatus(jobId, {
          youtubeStatus: "failed",
          youtubeError: "YouTube upload failed after retries",
        });
      }
    },
  },
);
