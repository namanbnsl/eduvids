import { serve } from "@upstash/workflow/nextjs";
import { WorkflowNonRetryableError } from "@upstash/workflow";

import {
  generateManimScript,
  generateVoiceoverScript,
  regenerateManimScriptWithError,
  generateYoutubeDescription,
  generateYoutubeTitle,
} from "@/lib/llm";
import { renderManimVideo } from "@/lib/e2b";
import { uploadVideo } from "@/lib/uploadthing";
import { jobStore } from "@/lib/job-store";

import {
  runHeuristicChecks,
  validateRequiredElements,
} from "@/lib/workflow/utils/heuristics";
import {
  updateJobProgress,
  stageToJobUpdate,
} from "@/lib/workflow/utils/progress";
import { workflowClient, getBaseUrl, qstashClientWithBypass, getTriggerHeaders } from "@/lib/workflow/client";

import type {
  VideoGenerationPayload,
  ManimGenerationAttempt,
  ManimGenerationErrorDetails,
} from "@/lib/workflow/types";
import type { ValidationStage, RenderLogEntry } from "@/lib/types";

const MAX_SCRIPT_FIX_ATTEMPTS = 3;
const MAX_RENDER_ATTEMPTS = 3;
const ATTEMPT_HISTORY_LIMIT = 3;

const clampDetail = (value?: string, limit = 2000): string | undefined => {
  if (!value) return undefined;
  return value.length > limit ? value.slice(0, limit) : value;
};

const extractRenderError = (err: unknown): ManimGenerationErrorDetails => {
  const baseError = err instanceof Error ? err : new Error(String(err));
  const renderError = baseError as Error & {
    stderr?: string;
    stdout?: string;
    exitCode?: number;
    stage?: ValidationStage;
    hint?: string;
    logs?: RenderLogEntry[];
  };

  return {
    message: renderError.message || "Unknown render error",
    stack: clampDetail(renderError.stack),
    stderr: clampDetail(renderError.stderr),
    stdout: clampDetail(renderError.stdout),
    exitCode: renderError.exitCode,
    stage: renderError.stage,
    hint: renderError.hint,
    logs: renderError.logs?.slice(-50),
  };
};

const fingerprintScript = (code: string) =>
  code
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join("\n");

export const { POST } = serve<VideoGenerationPayload>(
  async (context) => {
    const {
      prompt,
      userId,
      chatId,
      jobId,
      variant: rawVariant,
    } = context.requestPayload;

    const variant = rawVariant === "short" ? "short" : "video";
    const generationPrompt =
      variant === "short"
        ? `${prompt}\n\nThe final output must be a YouTube-ready vertical (9:16) short under one minute. Keep narration concise and design visuals for portrait orientation. The layout system automatically provides larger font constants optimized for portrait (FONT_TITLE=46, FONT_HEADING=36, FONT_BODY=32, FONT_CAPTION=28, FONT_LABEL=26) - always use these constants instead of hardcoded sizes. Split copy across multiple lines for readability, keep visual groups within the safe content area, and leave proper clearance between arrows, labels, and nearby objects using the auto-calculated margins.`
        : prompt;

    console.log(
      `🎬 Starting ${
        variant === "short" ? "vertical short" : "full video"
      } generation for prompt: "${prompt}"`
    );

    // Step 1: Generate voiceover script
    await updateJobProgress(jobId, {
      progress: 5,
      step: "Creating narration",
      details: "Writing script",
    });

    const voiceoverScript = await context.run(
      "generate-voiceover-script",
      async () => {
        return generateVoiceoverScript({ prompt: generationPrompt });
      }
    );

    console.log("✅ Voiceover script generated", {
      length: voiceoverScript.length,
    });

    await updateJobProgress(jobId, {
      progress: 12,
      step: "Narration ready",
      details: "Done",
    });

    // Step 2: Generate initial Manim script
    await updateJobProgress(jobId, {
      progress: 18,
      step: "Writing scenes",
      details: "Creating",
    });

    let script = await context.run(
      "generate-initial-manim-script",
      async () => {
        return generateManimScript({
          prompt: generationPrompt,
          voiceoverScript,
        });
      }
    );

    console.log("✅ Initial Manim script generated", {
      length: script.length,
    });

    await updateJobProgress(jobId, {
      progress: 24,
      step: "Scenes ready",
      details: "Code ready",
    });

    // Step 3: Pre-validation of required elements
    const preValidation = await context.run("pre-validate-script", async () => {
      return validateRequiredElements(script);
    });

    if (!preValidation.ok) {
      throw new WorkflowNonRetryableError(
        `Script failed pre-validation: ${preValidation.error}`
      );
    }

    // Step 4: Heuristic validation & fix loop
    await updateJobProgress(jobId, {
      progress: 30,
      step: "Checking scenes",
      details: "Validating",
    });

    const seenScripts = new Set<string>();
    seenScripts.add(fingerprintScript(script));

    for (
      let fixAttempt = 1;
      fixAttempt <= MAX_SCRIPT_FIX_ATTEMPTS;
      fixAttempt++
    ) {
      const validation = await context.run(
        `validate-script-${fixAttempt}`,
        async () => {
          return runHeuristicChecks(script);
        }
      );

      if (validation.ok) {
        console.log(`✅ Script passed validation on attempt ${fixAttempt}`);
        break;
      }

      console.log(
        `⚠️ Validation failed on attempt ${fixAttempt}: ${validation.error}`
      );

      await updateJobProgress(jobId, {
        progress: 32 + fixAttempt * 2,
        step: `Fixing script (attempt ${fixAttempt})`,
        details: "Auto-correcting issues",
      });

      script = await context.run(`fix-script-${fixAttempt}`, async () => {
        const fixed = await regenerateManimScriptWithError({
          prompt: generationPrompt,
          voiceoverScript,
          previousScript: script,
          error: validation.error ?? "Heuristic validation failed",
          attemptNumber: fixAttempt,
          attemptHistory: [],
          blockedScripts: Array.from(seenScripts),
        });
        return fixed.trim();
      });

      if (!script) {
        throw new WorkflowNonRetryableError(
          `Script fix attempt ${fixAttempt} returned empty script`
        );
      }

      const fingerprint = fingerprintScript(script);
      if (seenScripts.has(fingerprint)) {
        throw new WorkflowNonRetryableError(
          `Script fix loop detected - regenerated script matches a previous version`
        );
      }
      seenScripts.add(fingerprint);
    }

    await updateJobProgress(jobId, {
      progress: 42,
      step: "Ready to render",
      details: "Validation complete",
    });

    // Step 5: Render loop with error-driven regeneration
    const failedAttempts: ManimGenerationAttempt[] = [];
    const blockedScripts = new Map<string, string>();
    blockedScripts.set(fingerprintScript(script), script);

    let uploadUrl: string | undefined;
    let renderAttempts = 0;

    for (
      let renderAttempt = 1;
      renderAttempt <= MAX_RENDER_ATTEMPTS;
      renderAttempt++
    ) {
      await updateJobProgress(jobId, {
        progress: 44 + renderAttempt * 2,
        step: `Render attempt ${renderAttempt}`,
        details: "Starting render",
      });

      const renderResult = await context.run(
        `render-video-${renderAttempt}`,
        async () => {
          try {
            const usesManimML = script.includes("manim_ml");

            const result = await renderManimVideo({
              script,
              prompt,
              applyWatermark: true,
              renderOptions:
                variant === "short"
                  ? {
                      orientation: "portrait",
                      resolution: { width: 720, height: 1280 },
                    }
                  : undefined,
              plugins: usesManimML ? ["manim-ml"] : [],
              onProgress: async ({ stage, message }) => {
                const mapping = stageToJobUpdate(stage);
                await updateJobProgress(jobId, {
                  progress: mapping.progress,
                  step: mapping.step,
                  details: message,
                });
              },
            });

            if (
              !result ||
              typeof result.videoPath !== "string" ||
              !result.videoPath.startsWith("data:video/mp4;base64,")
            ) {
              throw new Error("Render did not produce a valid video");
            }

            await updateJobProgress(jobId, {
              progress: 88,
              step: "Saving video",
              details: "Uploading",
            });

            const url = await uploadVideo({
              videoPath: result.videoPath,
              userId,
            });

            return {
              success: true as const,
              uploadUrl: url,
              warnings: result.warnings ?? [],
            };
          } catch (err) {
            return {
              success: false as const,
              error: extractRenderError(err),
            };
          }
        }
      );

      if (renderResult.success) {
        uploadUrl = renderResult.uploadUrl;
        renderAttempts = renderAttempt;
        console.log(`✅ Render succeeded on attempt ${renderAttempt}`);
        break;
      }

      const renderError = renderResult.error;
      console.error(`❌ Render attempt ${renderAttempt} failed:`, {
        message: renderError.message,
        stage: renderError.stage,
        exitCode: renderError.exitCode,
      });

      failedAttempts.push({
        attemptNumber: renderAttempt,
        script,
        error: renderError,
      });

      if (failedAttempts.length > ATTEMPT_HISTORY_LIMIT) {
        failedAttempts.splice(0, failedAttempts.length - ATTEMPT_HISTORY_LIMIT);
      }

      if (renderAttempt === MAX_RENDER_ATTEMPTS) {
        break;
      }

      // Regenerate script with error context
      await updateJobProgress(jobId, {
        progress: 66,
        step: "Retrying render",
        details: "Regenerating script",
      });

      script = await context.run(
        `regenerate-script-after-render-${renderAttempt}`,
        async () => {
          const regenerated = await regenerateManimScriptWithError({
            prompt: generationPrompt,
            voiceoverScript,
            previousScript: script,
            error: renderError.message ?? "Unknown render error",
            errorDetails: renderError,
            attemptNumber: renderAttempt,
            attemptHistory: failedAttempts,
            blockedScripts: Array.from(blockedScripts.values()),
          });
          return regenerated.trim();
        }
      );

      if (!script) {
        throw new WorkflowNonRetryableError(
          `Script regeneration returned empty after render failure`
        );
      }

      const fingerprint = fingerprintScript(script);
      blockedScripts.set(fingerprint, script);

      // Re-validate regenerated script
      const revalidation = await context.run(
        `revalidate-script-${renderAttempt}`,
        async () => {
          return runHeuristicChecks(script);
        }
      );

      if (!revalidation.ok) {
        console.warn(
          `⚠️ Regenerated script failed validation: ${revalidation.error}`
        );
      }
    }

    if (!uploadUrl) {
      throw new WorkflowNonRetryableError(
        `Render failed after ${MAX_RENDER_ATTEMPTS} attempts. Last error: ${
          failedAttempts[failedAttempts.length - 1]?.error.message ?? "Unknown"
        }`
      );
    }

    await updateJobProgress(jobId, {
      progress: 90,
      step: "Video saved",
      details: "Done",
    });

    // Step 6: Generate YouTube metadata
    const metadata = await context.run(
      "generate-youtube-metadata",
      async () => {
        let title: string | undefined;
        let description: string | undefined;

        try {
          title = await generateYoutubeTitle({
            prompt,
            voiceoverScript,
          });
        } catch (error) {
          console.warn("Failed to generate YouTube title:", error);
        }

        try {
          description = await generateYoutubeDescription({
            prompt,
            voiceoverScript,
          });
        } catch (error) {
          console.warn("Failed to generate YouTube description:", error);
        }

        return { title: title?.trim(), description: description?.trim() };
      }
    );

    // Step 7: Update job status
    if (jobId) {
      await updateJobProgress(jobId, {
        progress: 95,
        step: "Finishing up",
        details: "Wrapping up",
      });
      await jobStore.setReady(jobId, uploadUrl);
      await jobStore.setYoutubeStatus(jobId, { youtubeStatus: "pending" });
    }

    // Step 8: Trigger YouTube upload workflow
    await context.run("trigger-youtube-upload", async () => {
      await workflowClient.trigger({
        headers: getTriggerHeaders(),
        url: `${getBaseUrl()}/api/workflow/upload-youtube`,
        body: {
          videoUrl: uploadUrl,
          title: metadata.title,
          description: metadata.description,
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
      voiceoverLength: voiceoverScript.length,
      renderAttempts,
      retriedAfterError: renderAttempts > 1,
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
          "Video generation failed. Please try again."
        );
      }
    },
  }
);
