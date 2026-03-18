import { serve } from "@upstash/workflow/nextjs";
import { WorkflowNonRetryableError } from "@upstash/workflow";

import {
  generateVoiceoverScript,
  generateScenePlan,
  generateManimScript,
  fixManimScript,
  generateVideoTitle,
  generateVideoDescription,
  generateThumbnailHtml,
} from "@/lib/llm";
import {
  finalizeManimRender,
  pollManimRender,
  startManimRender,
} from "@/lib/e2b";
import { uploadVideo, uploadImage } from "@/lib/uploadthing";
import { jobStore, artifactStore } from "@/lib/job-store";

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

    await context.run("generate-voiceover-script", async () => {
      await updateJobProgress(jobId, {
        progress: 5,
        step: "generating voiceover",
        details: "Crafting a narration that slaps",
      });
      const voiceoverScript = await generateVoiceoverScript({
        prompt: generationPrompt,
        sessionId: chatId,
      });
      await artifactStore.set(jobId, "voiceoverScript", voiceoverScript);
      console.log("✅ Voiceover script generated", {
        length: voiceoverScript.length,
      });
    });

    await context.run("generate-scene-plan", async () => {
      const voiceoverScript = await artifactStore.get(jobId, "voiceoverScript");
      await updateJobProgress(jobId, {
        progress: 12,
        step: "generating script",
        details: "Storyboarding the scenes",
      });
      const scenePlan = await generateScenePlan({
        prompt: generationPrompt,
        voiceoverScript,
        sessionId: chatId,
      });
      await artifactStore.set(jobId, "scenePlan", JSON.stringify(scenePlan));
      console.log("✅ Scene plan generated", {
        sceneCount: scenePlan.length,
      });
    });

    await context.run("generate-manim-script", async () => {
      const voiceoverScript = await artifactStore.get(jobId, "voiceoverScript");
      const scenePlan = JSON.parse(
        await artifactStore.get(jobId, "scenePlan"),
      );
      await updateJobProgress(jobId, {
        progress: 22,
        step: "verifying script",
        details: "Writing the animation code",
      });
      const script = await generateManimScript({
        prompt: generationPrompt,
        voiceoverScript,
        sessionId: chatId,
        scenePlan,
      });
      await artifactStore.set(jobId, "manimScript", script);
      console.log("✅ Manim script generated", { length: script.length });
    });

    const RENDER_STEP_TIMEOUT_MS = 282_000; // ~4.7 minutes to stay under workflow limits

    const renderStart = await context.run("render-video-start", async () => {
      const script = await artifactStore.get(jobId, "manimScript");
      await updateJobProgress(jobId, {
        progress: 40,
        step: "rendering video",
        details: "Bringing your animations to life",
      });
      return startManimRender({
        script,
        prompt: generationPrompt,
        sessionId: chatId,
        variant,
        applyWatermark: true,
        renderOptions:
          variant === "short"
            ? {
                resolution: { width: 720, height: 1280 },
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

    let renderState = renderStart.state;
    let pollAttempt = 0;
    while (true) {
      const pollResult = await context.run(
        `render-video-wait-${pollAttempt}`,
        async () => {
          await updateJobProgress(jobId, {
            progress: Math.min(80, 45 + pollAttempt * 3),
            step: "rendering video",
            details: "Still rendering your animation",
          });
          return pollManimRender({
            state: renderState,
            maxWaitMs: RENDER_STEP_TIMEOUT_MS,
          });
        },
      );

      renderState = pollResult.state;
      if (!pollResult.complete) {
        pollAttempt += 1;
        continue;
      }
      if (pollResult.success === false) {
        throw new WorkflowNonRetryableError(
          pollResult.errorMessage ?? "Manim render failed.",
        );
      }
      break;
    }

    // Finalize render AND upload inside a single step so the huge base64 data
    // URL (~5 MB) is never serialized into QStash workflow state (which has a
    // body-size limit and would silently drop the workflow).
    const uploadUrl = await context.run(
      "render-video-finalize-and-upload",
      async () => {
        await updateJobProgress(jobId, {
          progress: 80,
          step: "rendering video",
          details: "Polishing the final video",
        });
        const renderResult = await finalizeManimRender({
          state: renderState,
        });

        console.log("✅ Video rendered");

        await updateJobProgress(jobId, {
          progress: 85,
          step: "uploading video",
          details: "Beaming your video to the cloud",
        });
        const videoUrl = await uploadVideo({
          videoPath: renderResult.videoPath,
          userId,
        });
        console.log("✅ Video uploaded:", videoUrl);

        return videoUrl;
      },
    );

    console.log("✅ Video rendered & uploaded:", uploadUrl);

    // Generate thumbnail via LLM (best-effort). Error handling is inside the
    // callback because Upstash Workflow uses thrown WorkflowAbort errors for
    // step replay — wrapping context.run in try/catch breaks step sequencing.
    const thumbnailUrl = await context.run("generate-thumbnail", async () => {
      try {
        await updateJobProgress(jobId, {
          progress: 87,
          step: "generating thumbnail",
          details: "Creating your custom thumbnail",
        });

        const thumbnailHtml = await generateThumbnailHtml({
          prompt: generationPrompt,
          sessionId: chatId,
          variant,
        });

        const { html: satoriHtml } = await import("satori-html");
        const satori = (await import("satori")).default;
        const { Resvg } = await import("@resvg/resvg-js");
        const { readFile } = await import("fs/promises");
        const { join } = await import("path");

        const fontsDir = join(process.cwd(), "public", "fonts");
        const [lexendBold, lexendRegular, notoSansMath] = await Promise.all([
          readFile(join(fontsDir, "Lexend-Bold.ttf")),
          readFile(join(fontsDir, "Lexend-Regular.ttf")),
          readFile(join(fontsDir, "NotoSansMath-Regular.ttf")),
        ]);

        const markup = satoriHtml(thumbnailHtml);
        const svg = await satori(markup as Parameters<typeof satori>[0], {
          width: 1280,
          height: 720,
          fonts: [
            { name: "Lexend", data: lexendBold, weight: 700, style: "normal" },
            { name: "Lexend", data: lexendRegular, weight: 400, style: "normal" },
            { name: "Noto Sans Math", data: notoSansMath, weight: 400, style: "normal" },
          ],
        });

        const resvg = new Resvg(svg, {
          fitTo: { mode: "width", value: 1280 },
        });
        const pngData = resvg.render();
        const thumbBytes = pngData.asPng();

        if (!thumbBytes || thumbBytes.length === 0) {
          console.warn("Thumbnail PNG was empty after render");
          return undefined;
        }

        const thumbBase64 = Buffer.from(thumbBytes).toString("base64");
        const thumbnailDataUrl = `data:image/png;base64,${thumbBase64}`;

        const thumbUrl = await uploadImage({
          imagePath: thumbnailDataUrl,
          userId,
        });
        console.log("✅ Thumbnail uploaded:", thumbUrl);
        return thumbUrl;
      } catch (err) {
        console.warn("Thumbnail generation failed (non-fatal):", err);
        return undefined;
      }
    });

    // Generate title (best-effort)
    let videoTitle: string | undefined;
    let videoDescription: string | undefined;

    videoTitle = await context.run("generate-title", async () => {
      try {
        const title = await generateVideoTitle({ prompt, sessionId: chatId });
        console.log("✅ Title generated:", title);
        return title;
      } catch (err) {
        console.warn("Title generation failed (non-fatal):", err);
        return undefined;
      }
    });

    videoDescription = await context.run("generate-description", async () => {
      try {
        const voiceoverScript = await artifactStore.get(jobId, "voiceoverScript");
        const desc = await generateVideoDescription({
          prompt,
          voiceoverScript,
          sessionId: chatId,
          variant,
        });
        console.log("✅ Description generated:", { length: desc.length });
        return desc;
      } catch (err) {
        console.warn("Description generation failed (non-fatal):", err);
        return undefined;
      }
    });

    await context.run("finalize-job", async () => {
      await updateJobProgress(jobId, {
        progress: 95,
        step: "finalizing",
        details: "Putting the finishing touches on",
      });
      await jobStore.setReady(jobId, uploadUrl);
      await jobStore.setYoutubeStatus(jobId, { youtubeStatus: "pending" });
    });

    await context.run("trigger-youtube-upload", async () => {
      await workflowClient.trigger({
        headers: getTriggerHeaders(),
        url: `${getBaseUrl()}/api/workflow/upload-youtube`,
        body: {
          videoUrl: uploadUrl,
          title: videoTitle,
          description: videoDescription,
          prompt,
          jobId,
          userId,
          variant,
          thumbnailUrl,
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
