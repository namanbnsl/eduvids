import { serve } from "@upstash/workflow/nextjs";

import { uploadToYouTube } from "@/lib/youtube";
import { jobStore } from "@/lib/job-store";
import {
  workflowClient,
  getBaseUrl,
  qstashClientWithBypass,
  getTriggerHeaders,
} from "@/lib/workflow/client";

import type { VideoVariant } from "@/lib/workflow/types";

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
      return uploadToYouTube({
        videoUrl,
        title: title ?? prompt.slice(0, 100),
        description,
        tags,
        variant,
        thumbnailDataUrl: undefined,
      });
    });

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
    }

    return { success: true, ...youtubeResult };
  },
  {
    retries: 2,
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
