import { serve } from "@upstash/workflow/nextjs";
import { WorkflowNonRetryableError } from "@upstash/workflow";
import { createHash } from "node:crypto";

import {
  detectLanguage,
  enforceVoiceoverService,
  generateVoiceoverScript,
  generateScenePlan,
  generateManimScript,
  fixManimScript,
  generateVideoTitles,
  generateThumbnailManimScript,
  generateVideoDescription,
  manimVoiceoverTimingIssues,
  normalizeScenePlanTiming,
} from "@/lib/llm";
import {
  prepareManimSandbox,
  renderThumbnailCandidates,
  ManimValidationError,
  type PreparedSandboxState,
} from "@/lib/e2b";
import {
  startSandboxJob,
  pollSandboxJobWindow,
  MAX_SANDBOX_POLL_WINDOWS,
  renderCommand,
  startPostprocess,
  downloadVideo,
  cleanupSandbox,
  type SandboxJob,
} from "@/lib/workflow/sandbox-jobs";
import { generationFailureMessage, safeError } from "@/lib/workflow/errors";
import { getConvexClient, api } from "@/lib/convex-server";
import { uploadImage, uploadVideo } from "@/lib/uploadthing";
import { jobStore, artifactStore } from "@/lib/job-store";
import { findPreviousYouTubeVideo } from "@/lib/youtube";
import {
  selectThumbnailPair,
  type ThumbnailPair,
  type RelatedYouTubeVideo,
  type VideoTitleSet,
} from "@/lib/youtube-metadata";
import {
  EDUVIDS_TTS_SERVICE_SOURCE,
  eduvidsTTSSandboxEnvironment,
} from "@/lib/eduvids-tts-service";

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

type CachedPreparedSandbox = {
  scriptHash: string;
  state: PreparedSandboxState;
};

function manimScriptHash(script: string): string {
  return createHash("sha256")
    .update(script)
    .update("\0")
    .update(EDUVIDS_TTS_SERVICE_SOURCE)
    .digest("hex");
}

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

    const voiceoverLanguage = await context.run(
      "detect-voiceover-language",
      async () => {
        const saved = await artifactStore.find(jobId, "voiceoverLanguage");
        if (saved) return saved;
        const language = await detectLanguage(
          await artifactStore.get(jobId, "voiceoverScript"),
        );
        await artifactStore.set(jobId, "voiceoverLanguage", language);
        return language;
      },
    );

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
        voiceoverLanguage,
      });
      await artifactStore.set(jobId, "manimScript", script);
      console.log("✅ Manim script generated", { length: script.length });
    });

    await context.run("ensure-manim-voiceover-timing-v3", async () => {
      const [currentScript, voiceoverScript, storedScenePlan] =
        await Promise.all([
          artifactStore.get(jobId, "manimScript"),
          artifactStore.get(jobId, "voiceoverScript"),
          artifactStore.get(jobId, "scenePlan"),
        ]);
      const scenePlan = normalizeScenePlanTiming(JSON.parse(storedScenePlan));
      const expectedBeatCount = scenePlan.reduce(
        (count, scene) => count + scene.beats.length,
        0,
      );
      const timingIssues = manimVoiceoverTimingIssues(
        currentScript,
        expectedBeatCount,
      );
      await artifactStore.set(jobId, "scenePlan", JSON.stringify(scenePlan));
      if (timingIssues.length === 0) return;

      await updateJobProgress(jobId, {
        progress: 25,
        step: "improving voiceover timing",
        details: "Matching visual beats to narration",
      });
      console.warn("Regenerating a poorly synchronized Manim script", {
        issueCount: timingIssues.length,
        expectedBeatCount,
      });
      const regenerated = await generateManimScript({
        prompt: generationPrompt,
        voiceoverScript,
        sessionId: chatId,
        scenePlan,
        voiceoverLanguage,
      });
      await artifactStore.set(jobId, "manimScript", regenerated);
    });

    const voiceoverSelection = await context.run(
      "enforce-voiceover-service-v3",
      async () => {
        const currentScript = await artifactStore.get(jobId, "manimScript");
        const enforced = enforceVoiceoverService(
          currentScript,
          voiceoverLanguage,
        );
        await artifactStore.set(jobId, "manimScript", enforced.script);
        await artifactStore.set(jobId, "voiceoverProvider", enforced.provider);
        console.log("✅ Voiceover service verified", {
          language: voiceoverLanguage,
          provider: enforced.provider,
          normalized: enforced.script !== currentScript,
        });
        return { language: voiceoverLanguage, provider: enforced.provider };
      },
    );

    const previousVideo = await context.run(
      "resolve-previous-youtube-video",
      async () => {
        const saved = await artifactStore.find(jobId, "previousYoutubeVideo");
        if (saved) {
          return JSON.parse(saved) as RelatedYouTubeVideo | null;
        }
        if (
          !process.env.GOOGLE_CLIENT_ID ||
          !process.env.GOOGLE_CLIENT_SECRET ||
          !process.env.GOOGLE_REFRESH_TOKEN
        ) {
          await artifactStore.set(jobId, "previousYoutubeVideo", "null");
          return null;
        }

        try {
          const result = await findPreviousYouTubeVideo();
          await artifactStore.set(
            jobId,
            "previousYoutubeVideo",
            JSON.stringify(result ?? null),
          );
          return result ?? null;
        } catch (error) {
          console.warn(
            "Previous-video lookup failed; using the standard outro:",
            safeError(error),
          );
          await artifactStore.set(jobId, "previousYoutubeVideo", "null");
          return null;
        }
      },
    );

    const waitForJob = async (name: string, job: SandboxJob) => {
      for (let window = 0; window < MAX_SANDBOX_POLL_WINDOWS; window++) {
        const result = await context.run(
          `${name}-poll-window-v2-${window}`,
          () => pollSandboxJobWindow(job),
        );
        if (result.complete) return result;
      }
      throw new WorkflowNonRetryableError("Sandbox job timed out");
    };

    let prepared: PreparedSandboxState | undefined;
    for (let attempt = 0; attempt < 3; attempt++) {
      // Validation failures are data here, so the repair runs in its own invocation.
      const preparation = await context.run(
        `prepare-sandbox-tts-v3-${attempt}`,
        async () => {
          await updateJobProgress(jobId, {
            progress: 35,
            step: "validating script",
            details: "Checking animation code",
          });
          const script = await artifactStore.get(jobId, "manimScript");
          const scriptHash = manimScriptHash(script);
          const cached = await artifactStore.find(jobId, `prepared-${attempt}`);
          if (cached) {
            const parsed = JSON.parse(cached) as Partial<CachedPreparedSandbox>;
            if (parsed.scriptHash === scriptHash && parsed.state) {
              return { state: parsed.state, error: null };
            }
            console.warn("Ignoring stale prepared sandbox artifact", {
              attempt,
              provider: voiceoverSelection.provider,
            });
          }
          try {
            const state = await prepareManimSandbox({
              script,
              prompt: generationPrompt,
              sessionId: chatId,
              variant,
              previousVideo: previousVideo ?? undefined,
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
              JSON.stringify({ scriptHash, state: compact }),
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
          `launch-render-tts-v3-${attempt}`,
          async () => {
            await updateJobProgress(jobId, {
              progress: 45,
              step: "rendering video",
              details: "Rendering animation",
            });
            return startSandboxJob(
              preparation.state!.sandboxId,
              "render-job-tts-v3",
              renderCommand(preparation.state!),
              eduvidsTTSSandboxEnvironment(),
            );
          },
        );
        const rendered = await waitForJob(
          `render-tts-v3-${attempt}`,
          renderJob,
        );
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
          const enforced = enforceVoiceoverService(
            cached,
            voiceoverLanguage,
          ).script;
          await artifactStore.set(jobId, `repaired-${attempt}`, enforced);
          await artifactStore.set(jobId, "manimScript", enforced);
          return;
        }
        const script = await artifactStore.get(jobId, "manimScript");
        const fixed = await fixManimScript({
          script,
          errors: error ?? "No renderable scene class",
          sessionId: chatId,
          voiceoverLanguage,
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

    const videoTitleSet = await context.run("generate-titles", async () => {
      try {
        const saved = await artifactStore.find(jobId, "videoTitleSet");
        if (saved) return JSON.parse(saved) as VideoTitleSet;
        const [voiceoverScript, storedScenePlan] = await Promise.all([
          artifactStore.get(jobId, "voiceoverScript"),
          artifactStore.get(jobId, "scenePlan"),
        ]);
        const titles = await generateVideoTitles({
          prompt,
          sessionId: chatId,
          voiceoverScript,
          scenePlan: JSON.parse(storedScenePlan),
        });
        await artifactStore.set(jobId, "videoTitleSet", JSON.stringify(titles));
        console.log("✅ Title candidates generated:", titles.candidates);
        return titles;
      } catch (err) {
        console.warn("Title generation failed (non-fatal):", err);
        return undefined;
      }
    });

    const thumbnailScript = await context.run(
      "generate-thumbnail-manim-v2",
      async () => {
        if (!videoTitleSet) return undefined;
        const saved = await artifactStore.find(jobId, "thumbnailManimScript");
        if (saved) return saved;
        try {
          const [voiceoverScript, storedScenePlan] = await Promise.all([
            artifactStore.get(jobId, "voiceoverScript"),
            artifactStore.get(jobId, "scenePlan"),
          ]);
          const script = await generateThumbnailManimScript({
            prompt,
            titles: videoTitleSet,
            sessionId: chatId,
            designSeed: jobId,
            voiceoverScript,
            scenePlan: JSON.parse(storedScenePlan),
          });
          await artifactStore.set(jobId, "thumbnailManimScript", script);
          return script;
        } catch (error) {
          console.warn(
            "Thumbnail art direction failed; using the verified motif renderer:",
            safeError(error),
          );
          return undefined;
        }
      },
    );

    const thumbnailPairs = await context.run(
      "generate-thumbnail-candidates",
      async () => {
        if (!videoTitleSet) return undefined;
        const saved = await artifactStore.find(jobId, "thumbnailPairs");
        if (saved) {
          return JSON.parse(saved) as ThumbnailPair[];
        }

        try {
          const images = await renderThumbnailCandidates({
            prepared: prepared!,
            titles: videoTitleSet,
            topic: prompt,
            designSeed: jobId,
            generatedScript: thumbnailScript,
          });
          const urls = await Promise.all(
            images.map((imagePath, index) =>
              uploadImage({
                imagePath,
                userId,
                customId: `${jobId}-thumbnail-${index}`,
              }),
            ),
          );
          const pairs = videoTitleSet.candidates.map(
            (candidateTitle, index) => ({
              title: candidateTitle,
              thumbnailUrl: urls[index]!,
            }),
          );
          await artifactStore.set(
            jobId,
            "thumbnailPairs",
            JSON.stringify(pairs),
          );
          return pairs;
        } catch (error) {
          console.warn(
            "Thumbnail generation failed; continuing with YouTube defaults:",
            safeError(error),
          );
          return undefined;
        }
      },
    );

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
      const selectedThumbnailPair = videoTitleSet
        ? selectThumbnailPair(videoTitleSet, thumbnailPairs)
        : undefined;
      await workflowClient.trigger({
        workflowRunId: `youtube-${jobId}`,
        headers: getTriggerHeaders(),
        url: `${getBaseUrl()}/api/workflow/upload-youtube`,
        body: {
          videoUrl: uploadUrl,
          title: selectedThumbnailPair?.title ?? videoTitleSet?.selected,
          description: videoDescription,
          prompt,
          jobId,
          userId,
          variant,
          thumbnailUrl: selectedThumbnailPair?.thumbnailUrl,
        },
      });
    });

    // Cleanup is separate from upload, persistence, packaging, and publishing.
    await context.run("cleanup-sandbox", () =>
      cleanupSandbox(prepared!.sandboxId),
    );

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
