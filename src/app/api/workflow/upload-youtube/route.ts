import { WorkflowNonRetryableError } from "@upstash/workflow";
import { safeError } from "@/lib/workflow/errors";
import { serve } from "@upstash/workflow/nextjs";

import { uploadToYouTube } from "@/lib/youtube";
import { jobStore, artifactStore } from "@/lib/job-store";
import { getConvexClient, api } from "@/lib/convex-server";
import {
  workflowClient,
  getBaseUrl,
  qstashClientWithBypass,
  getTriggerHeaders,
} from "@/lib/workflow/client";

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
};

export const { POST } = serve<YouTubeUploadPayload>(
  async (context) => {
    const { videoUrl, title, description, prompt, jobId, variant } =
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
      const key = jobId ?? context.workflowRunId;
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
          description,
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

    // Trigger X (Twitter) post workflow
    await context.run("trigger-x-upload", async () => {
      if (
        !process.env.X_API_KEY ||
        !process.env.X_API_KEY_SECRET ||
        !process.env.X_ACCESS_TOKEN ||
        !process.env.X_ACCESS_TOKEN_SECRET
      )
        return;
      await workflowClient.trigger({
        workflowRunId: `x-${youtubeResult.videoId}`,
        retries: 0,
        headers: getTriggerHeaders(),
        url: `${getBaseUrl()}/api/workflow/upload-x`,
        body: {
          videoUrl: youtubeResult.watchUrl,
          title: youtubeResult.title,
        },
      });
    });

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
