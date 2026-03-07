import { serve } from "@upstash/workflow/nextjs";
import { WorkflowNonRetryableError } from "@upstash/workflow";

import { generateVoiceoverScript, generateManimScript } from "@/lib/llm";
import { renderManimVideo } from "@/lib/e2b";
import { uploadVideo } from "@/lib/uploadthing";
import { jobStore } from "@/lib/job-store";

import { updateJobProgress } from "@/lib/workflow/utils/progress";
import {
  workflowClient,
  getBaseUrl,
  qstashClientWithBypass,
  getTriggerHeaders,
} from "@/lib/workflow/client";

type VideoGenerationPayload = {
  prompt: string;
  userId: string;
  chatId: string;
  jobId?: string;
  variant?: "video" | "short";
};

export const runtime = "nodejs";

export const { POST } = serve<VideoGenerationPayload>(
  async (context) => {
    const {
      prompt,
      userId,
      chatId,
      jobId,
      variant: rawVariant,
    } = context.requestPayload;

    if (!jobId) {
      throw new WorkflowNonRetryableError("Missing jobId in workflow payload");
    }

    const variant = rawVariant === "short" ? "short" : "video";
    const generationPrompt =
      variant === "short"
        ? `${prompt}\n\nThe final output must be a YouTube-ready vertical (9:16) short under one minute. Keep narration concise and design visuals for portrait orientation. Use large readable typography and keep visual groups well spaced.`
        : prompt;

    console.log(
      `🎬 Starting ${variant === "short" ? "vertical short" : "full video"} generation for prompt: "${prompt}"`,
    );

    const voiceoverScript = await context.run(
      "generate-voiceover-script",
      async () => {
        await updateJobProgress(jobId, {
          progress: 5,
          step: "Creating narration",
          details: "Writing script",
        });
        return generateVoiceoverScript({
          prompt: generationPrompt,
          sessionId: chatId,
        });
      },
    );

    console.log("✅ Voiceover script generated", {
      length: voiceoverScript.length,
    });

    const script = await context.run(
      "generate-manim-script",
      async () => {
        await updateJobProgress(jobId, {
          progress: 18,
          step: "Writing scenes",
          details: "Creating",
        });
        return generateManimScript({
          prompt: generationPrompt,
          voiceoverScript,
          sessionId: chatId,
        });
      },
    );

    console.log("✅ Manim script generated", { length: script.length });

    const renderResult = await context.run("render-video", async () => {
      await updateJobProgress(jobId, {
        progress: 40,
        step: "Rendering video",
        details: "Running Manim",
      });
      return renderManimVideo({
        script,
        prompt: generationPrompt,
        applyWatermark: true,
        renderOptions:
          variant === "short"
            ? { resolution: { width: 1080, height: 1920 }, orientation: "portrait" as const }
            : undefined,
      });
    });

    console.log("✅ Video rendered");

    const uploadUrl = await context.run("upload-video", async () => {
      await updateJobProgress(jobId, {
        progress: 85,
        step: "Uploading video",
        details: "Saving",
      });
      return uploadVideo({ videoPath: renderResult.videoPath, userId });
    });

    console.log("✅ Video uploaded:", uploadUrl);

    await context.run("finalize-and-trigger-youtube-upload", async () => {
      await updateJobProgress(jobId, {
        progress: 95,
        step: "Finishing up",
        details: "Wrapping up",
      });
      await jobStore.setReady(jobId, uploadUrl);
      await jobStore.setYoutubeStatus(jobId, { youtubeStatus: "pending" });

      await workflowClient.trigger({
        headers: getTriggerHeaders(),
        url: `${getBaseUrl()}/api/workflow/upload-youtube`,
        body: {
          videoUrl: uploadUrl,
          prompt,
          voiceoverScript,
          jobId,
          userId,
          variant,
        },
      });
    });

    return {
      success: true,
      videoUrl: uploadUrl,
      prompt,
      userId,
      chatId,
      generatedAt: new Date().toISOString(),
    };
  },
  {
    retries: 0,
    qstashClient: qstashClientWithBypass,
    failureFunction: async ({ context, failStatus, failResponse }) => {
      const { jobId } = context.requestPayload;
      console.error("Workflow failed:", { failStatus, failResponse });

      if (jobId) {
        await jobStore.setError(
          jobId,
          "Video generation failed. Please try again.",
        );
      }
    },
  },
);
