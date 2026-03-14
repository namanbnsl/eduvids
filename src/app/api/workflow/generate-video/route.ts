import { serve } from "@upstash/workflow/nextjs";
import { WorkflowNonRetryableError } from "@upstash/workflow";

import {
  generateVoiceoverScript,
  generateScenePlan,
  generateManimScript,
  fixManimScript,
  generateVideoTitle,
  generateVideoDescription,
} from "@/lib/llm";
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

    const voiceoverScript = await context.run(
      "generate-voiceover-script",
      async () => {
        await updateJobProgress(jobId, {
          progress: 5,
          step: "generating voiceover",
          details: "Crafting a narration that slaps",
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

    const scenePlan = await context.run("generate-scene-plan", async () => {
      await updateJobProgress(jobId, {
        progress: 12,
        step: "generating script",
        details: "Storyboarding the scenes",
      });
      return generateScenePlan({
        prompt: generationPrompt,
        voiceoverScript,
        sessionId: chatId,
      });
    });

    console.log("✅ Scene plan generated", {
      sceneCount: scenePlan.length,
    });

    const script = await context.run("generate-manim-script", async () => {
      await updateJobProgress(jobId, {
        progress: 22,
        step: "verifying script",
        details: "Writing the animation code",
      });
      return generateManimScript({
        prompt: generationPrompt,
        voiceoverScript,
        sessionId: chatId,
        scenePlan,
      });
    });

    console.log("✅ Manim script generated", { length: script.length });

    const renderResult = await context.run("render-video", async () => {
      await updateJobProgress(jobId, {
        progress: 40,
        step: "rendering video",
        details: "Bringing your animations to life",
      });
      return renderManimVideo({
        script,
        prompt: generationPrompt,
        applyWatermark: true,
        renderOptions:
          variant === "short"
            ? {
                resolution: { width: 1080, height: 1920 },
                orientation: "portrait" as const,
              }
            : undefined,
        scriptFixer: (currentScript, errors) =>
          fixManimScript({
            script: currentScript,
            errors,
            sessionId: chatId,
          }),
      });
    });

    console.log("✅ Video rendered");

    const uploadUrl = await context.run("upload-video", async () => {
      await updateJobProgress(jobId, {
        progress: 85,
        step: "uploading video",
        details: "Beaming your video to the cloud",
      });
      return uploadVideo({ videoPath: renderResult.videoPath, userId });
    });

    console.log("✅ Video uploaded:", uploadUrl);

    // Generate title (best-effort)
    let videoTitle: string | undefined;
    let videoDescription: string | undefined;

    try {
      videoTitle = await context.run("generate-title", async () => {
        return generateVideoTitle({ prompt, sessionId: chatId });
      });
      console.log("✅ Title generated:", videoTitle);
    } catch (err) {
      console.warn("Title generation failed (non-fatal):", err);
    }

    try {
      videoDescription = await context.run("generate-description", async () => {
        return generateVideoDescription({
          prompt,
          voiceoverScript,
          sessionId: chatId,
          variant,
        });
      });
      console.log("✅ Description generated:", {
        length: videoDescription.length,
      });
    } catch (err) {
      console.warn("Description generation failed (non-fatal):", err);
    }

    await context.run("finalize-and-trigger-youtube-upload", async () => {
      await updateJobProgress(jobId, {
        progress: 95,
        step: "finalizing",
        details: "Putting the finishing touches on",
      });
      await jobStore.setReady(jobId, uploadUrl);
      await jobStore.setYoutubeStatus(jobId, { youtubeStatus: "pending" });

      await workflowClient.trigger({
        headers: getTriggerHeaders(),
        url: `${getBaseUrl()}/api/workflow/upload-youtube`,
        body: {
          videoUrl: uploadUrl,
          title: videoTitle,
          description: videoDescription,
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
