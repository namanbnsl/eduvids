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
import {
  prepareManimSandbox,
  ManimValidationError,
  type PreparedSandboxState,
} from "@/lib/e2b";
import {
  startSandboxJob,
  pollSandboxJob,
  renderCommand,
  startPostprocess,
  downloadVideo,
  cleanupSandbox,
  type SandboxJob,
} from "@/lib/workflow/sandbox-jobs";
import { generationFailureMessage, safeError } from "@/lib/workflow/errors";
import { getConvexClient, api } from "@/lib/convex-server";
import { uploadVideo } from "@/lib/uploadthing";
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
export const maxDuration = 300;

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
      if (await artifactStore.find(jobId, "voiceoverScript")) return;
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
      if (await artifactStore.find(jobId, "scenePlan")) return;
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
      if (await artifactStore.find(jobId, "manimScript")) return;
      const voiceoverScript = await artifactStore.get(jobId, "voiceoverScript");
      const scenePlan = JSON.parse(await artifactStore.get(jobId, "scenePlan"));
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

    const waitForJob = async (name: string, job: SandboxJob) => {
      for (let poll = 0; poll < 190; poll++) {
        const result = await context.run(`${name}-poll-${poll}`, () =>
          pollSandboxJob(job),
        );
        if (result.complete) return result;
        await context.sleep(`${name}-sleep-${poll}`, 10);
      }
      throw new WorkflowNonRetryableError("Sandbox job timed out");
    };

    let prepared: PreparedSandboxState | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      // Validation failures are data here, so the repair runs in its own invocation.
      const preparation = await context.run(
        `prepare-sandbox-${attempt}`,
        async () => {
          await updateJobProgress(jobId, {
            progress: 35,
            step: "validating script",
            details: "Checking animation code",
          });
          const cached = await artifactStore.find(jobId, `prepared-${attempt}`);
          if (cached)
            return {
              state: JSON.parse(cached) as PreparedSandboxState,
              error: null,
            };
          try {
            const state = await prepareManimSandbox({
              script: await artifactStore.get(jobId, "manimScript"),
              prompt: generationPrompt,
              sessionId: chatId,
              variant,
              applyWatermark: true,
              skipDryRun: true,
              renderOptions:
                variant === "short"
                  ? {
                      resolution: { width: 720, height: 1280 },
                      orientation: "portrait",
                    }
                  : undefined,
              onProgress: async ({ sandboxId }) => {
                if (sandboxId)
                  await artifactStore.set(jobId, "sandboxId", sandboxId);
              },
            });
            // Keep diagnostic logs out of the repeatedly serialized workflow history.
            const compact = { ...state, logs: [] };
            await artifactStore.set(
              jobId,
              `prepared-${attempt}`,
              JSON.stringify(compact),
            );
            return { state: compact, error: null };
          } catch (error) {
            if (!(error instanceof ManimValidationError)) throw error;
            return { state: null, error: safeError(error) };
          }
        },
      );
      let error = preparation.error;
      if (preparation.state) {
        prepared = preparation.state;
        const renderJob = await context.run(
          `launch-render-${attempt}`,
          async () => {
            await updateJobProgress(jobId, {
              progress: 45,
              step: "rendering video",
              details: "Rendering animation",
            });
            return startSandboxJob(
              preparation.state!.sandboxId,
              "render-job",
              renderCommand(preparation.state!),
            );
          },
        );
        const rendered = await waitForJob(`render-${attempt}`, renderJob);
        if (rendered.exitCode === 0) break;
        error = rendered.error ?? "Manim render failed";
        await context.run(`cleanup-failed-render-${attempt}`, () =>
          cleanupSandbox(preparation.state!.sandboxId),
        );
        prepared = undefined;
      }
      if (attempt === 2)
        throw new WorkflowNonRetryableError(
          `Manim validation failed after repairs: ${error}`,
        );
      await context.run(`repair-script-${attempt}`, async () => {
        await updateJobProgress(jobId, {
          step: "repairing script",
          details: "Repairing animation errors",
        });
        const cached = await artifactStore.find(jobId, `repaired-${attempt}`);
        if (cached) {
          await artifactStore.set(jobId, "manimScript", cached);
          return;
        }
        const script = await artifactStore.get(jobId, "manimScript");
        const fixed = await fixManimScript({
          script,
          errors: error ?? "No renderable scene class",
          sessionId: chatId,
        });
        if (fixed === script) throw new Error("Script repair made no changes");
        await artifactStore.set(jobId, `repaired-${attempt}`, fixed);
        await artifactStore.set(jobId, "manimScript", fixed);
      });
    }
    if (!prepared)
      throw new WorkflowNonRetryableError("No validated render available");

    const processing = await context.run("launch-postprocess", () =>
      startPostprocess(prepared!),
    );
    const processed = await waitForJob("postprocess", processing);
    if (processed.exitCode !== 0)
      throw new WorkflowNonRetryableError(
        `Video processing failed: ${processed.error}`,
      );

    const uploadUrl = await context.run("upload-video", async () => {
      const existing = await artifactStore.find(jobId, "uploadUrl");
      if (existing) return existing;
      await updateJobProgress(jobId, {
        progress: 85,
        step: "uploading video",
        details: "Saving your video",
      });
      const videoUrl = await uploadVideo({
        videoPath: await downloadVideo(prepared!.sandboxId),
        userId,
        jobId,
      });
      await artifactStore.set(jobId, "uploadUrl", videoUrl);
      return videoUrl;
    });
    await context.run("finalize-job", async () => {
      await jobStore.setReady(jobId, uploadUrl);
    });
    await context.run("persist-video", async () => {
      await getConvexClient().mutation(api.videos.saveCompleted, {
        jobId,
        userId,
        description: prompt,
        variant,
        videoUrl: uploadUrl,
      });
    });

    // Cleanup is separate from both upload and marking the video ready.
    await context.run("cleanup-sandbox", () =>
      cleanupSandbox(prepared!.sandboxId),
    );

    const videoTitle = await context.run("generate-title", async () => {
      try {
        const title = await generateVideoTitle({ prompt, sessionId: chatId });
        console.log("✅ Title generated:", title);
        return title;
      } catch (err) {
        console.warn("Title generation failed (non-fatal):", err);
        return undefined;
      }
    });

    const videoDescription = await context.run(
      "generate-description",
      async () => {
        try {
          const voiceoverScript = await artifactStore.get(
            jobId,
            "voiceoverScript",
          );
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
      },
    );

    await context.run("trigger-youtube-upload", async () => {
      if (
        !process.env.GOOGLE_CLIENT_ID ||
        !process.env.GOOGLE_CLIENT_SECRET ||
        !process.env.GOOGLE_REFRESH_TOKEN
      )
        return;
      await jobStore.setYoutubeStatus(jobId, { youtubeStatus: "pending" });
      await workflowClient.trigger({
        workflowRunId: `youtube-${jobId}`,
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
    retries: 3,
    retryDelay: "(1 + retried) * 10000",
    qstashClient: qstashClientWithBypass,
    failureFunction: async ({ context, failStatus, failResponse }) => {
      const { jobId } = context.requestPayload;
      console.error("Workflow failed:", {
        jobId,
        runId: context.workflowRunId,
        failStatus,
        error: safeError(failResponse),
      });

      if (jobId) {
        const job = await jobStore.get(jobId);
        if (job?.status === "ready") {
          if (job.youtubeStatus === "pending")
            await jobStore.setYoutubeStatus(jobId, {
              youtubeStatus: "failed",
              youtubeError: "Could not schedule YouTube upload",
            });
        } else {
          const message = generationFailureMessage(failResponse);
          await jobStore.setError(jobId, message);
          await getConvexClient().mutation(api.videos.setError, {
            jobId,
            error: message,
          });
        }
        const sandboxId = await artifactStore.find(jobId, "sandboxId");
        if (sandboxId) await cleanupSandbox(sandboxId);
      }
    },
  },
);
