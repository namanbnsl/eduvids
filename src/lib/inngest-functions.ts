import { inngest } from "./inngest";
import {
  generateManimScript,
  generateVoiceoverScript,
  regenerateManimScriptWithError,
  verifyManimScript,
} from "./gemini";
import type { ManimGenerationAttempt } from "./gemini";
import { renderManimVideo } from "./e2b";
import { uploadVideo } from "./uploadthing";
import { jobStore } from "./job-store";
import { uploadToYouTube } from "./youtube";

type RenderProcessError = Error & {
  stderr?: string;
  stdout?: string;
  exitCode?: number;
};

function buildYouTubeTitle(params: {
  prompt?: string;
  voiceoverScript?: string;
}): string {
  const { prompt, voiceoverScript } = params;

  const sanitize = (input: string) =>
    input
      .replace(/[\r\n]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[\p{Cf}\u0000-\u001F]/gu, "");

  const capitalize = (input: string) =>
    input.length ? input[0].toUpperCase() + input.slice(1) : input;

  const clamp = (input: string, max: number) =>
    input.length <= max ? input : input.slice(0, max).trim();

  let candidate = sanitize(prompt ?? "");
  if (!candidate && voiceoverScript) {
    const firstLine =
      voiceoverScript.split(/\r?\n/).find((l) => sanitize(l).length > 0) ?? "";
    candidate = sanitize(firstLine);
  }

  candidate = candidate.replace(/[\s.,;:!?-]+$/g, "");
  candidate = capitalize(candidate);

  // YouTube title max length is 100 characters
  candidate = clamp(candidate, 100);

  if (!candidate) {
    throw new Error("Cannot build a non-empty YouTube title from inputs");
  }

  return candidate;
}

export const generateVideo = inngest.createFunction(
  {
    id: "generate-manim-video",
    timeouts: { start: "20m", finish: "25m" },
    retries: 2, // Allow 2 additional retries at the function level
  },
  { event: "video/generate.request" },
  async ({ event, step }) => {
    const { prompt, userId, chatId, jobId } = event.data as {
      prompt: string;
      userId: string;
      chatId: string;
      jobId?: string;
    };

    console.log(`Starting video generation for prompt: "${prompt}"`);

    const verifyScriptWithAutoFix = async ({
      scriptToCheck,
      context,
      narration,
    }: {
      scriptToCheck: string;
      context: string;
      narration: string;
    }): Promise<string> => {
      const MAX_VERIFY_PASSES = 1;
      const seenScripts = new Set<string>();
      const attemptHistory: ManimGenerationAttempt[] = [];
      let current = scriptToCheck.trim();
      let lastError: string | undefined;

      for (let pass = 1; pass <= MAX_VERIFY_PASSES; pass++) {
        if (seenScripts.has(current)) {
          throw new Error(
            `Auto-fix loop detected during ${context}; the verifier repeated a script it previously evaluated. Last error: ${
              lastError ?? "unknown"
            }`
          );
        }
        seenScripts.add(current);

        const result = await verifyManimScript({
          prompt,
          voiceoverScript: narration,
          script: current,
        });

        if (result.ok) {
          const approvedScript =
            result.fixedScript && result.fixedScript.trim().length > 0
              ? result.fixedScript.trim()
              : current;

          if (approvedScript !== current) {
            console.log(
              `Verifier approved script with inline corrections on pass ${pass} (${context}).`
            );
          } else if (pass > 1) {
            console.log(
              `Verifier approved script after ${pass} passes (${context}).`
            );
          }

          return approvedScript;
        }

        lastError = result.error;

        if (lastError) {
          attemptHistory.push({
            attemptNumber: pass,
            script: current,
            error: { message: lastError },
          });
        }

        let nextScript: string | undefined;

        if (result.fixedScript && result.fixedScript.trim().length > 0) {
          nextScript = result.fixedScript.trim();
          console.log(
            `Verifier produced a corrected script for ${context} on pass ${pass} (length: ${nextScript.length}).`
          );
        } else {
          console.warn(
            `Verifier did not return a fix for ${context} on pass ${pass}; regenerating with error feedback.`
          );
          nextScript = (
            await regenerateManimScriptWithError({
              prompt,
              voiceoverScript: narration,
              previousScript: current,
              error: lastError ?? "Unknown verification error",
              attemptNumber: pass,
              attemptHistory,
            })
          ).trim();
        }

        if (!nextScript || nextScript.trim().length === 0) {
          throw new Error(
            `Verifier reported issues during ${context} but produced an empty fix: ${
              lastError ?? "unknown"
            }`
          );
        }

        current = nextScript;
      }

      console.warn(
        `Verifier could not approve the script during ${context} after ${MAX_VERIFY_PASSES} passes. Last error: ${
          lastError ?? "unknown"
        } — proceeding with the best-effort script.`
      );
      return current;
    };

    try {
      await jobStore.setProgress(jobId!, {
        progress: 5,
        step: "generating voiceover",
      });
      const voiceoverScript = await step.run(
        "generate-voiceover-script",
        async () => {
          return await generateVoiceoverScript({ prompt });
        }
      );

      console.log("Generated voiceover script", {
        length: voiceoverScript.length,
      });

      await jobStore.setProgress(jobId!, {
        progress: 15,
        step: "generating manim script",
      });
      let script = await step.run("generate-manim-script", async () => {
        return await generateManimScript({
          prompt,
          voiceoverScript,
        });
      });

      console.log("Generated Manim script", { scriptLength: script.length });

      await jobStore.setProgress(jobId!, {
        progress: 38,
        step: "verifying script",
      });
      const unverifiedScript = script;
      script = await step.run("verify-manim-script-initial", async () => {
        return await verifyScriptWithAutoFix({
          scriptToCheck: script,
          context: "initial generation",
          narration: voiceoverScript,
        });
      });

      console.log(
        `✅ Script verification complete. Using verified script for rendering.`,
        {
          originalLength: unverifiedScript.length,
          verifiedLength: script.length,
          changed: unverifiedScript !== script,
        }
      );

      // Render video with retry logic
      await jobStore.setProgress(jobId!, {
        progress: 45,
        step: "rendering video",
      });
      const { videoUrl, renderAttempt } = await step.run(
        "render-video-with-retries",
        async () => {
          const MAX_RETRIES = 5;
          let currentScript = script;
          const failedAttempts: ManimGenerationAttempt[] = [];

          for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
              console.log(`Render attempt ${attempt}/${MAX_RETRIES}...`);
              console.log(
                `▶️ Rendering with verified script (length: ${currentScript.length} chars)`
              );

              // Mid-render heartbeat
              await jobStore.setProgress(jobId!, {
                progress: Math.min(55 + attempt * 5, 80),
                step: `rendering`,
              });
              const dataUrlOrPath = await renderManimVideo({
                script: currentScript,
                prompt,
              });
              await jobStore.setProgress(jobId!, {
                progress: 82,
                step: "uploading video",
              });
              const videoUrl = await uploadVideo({
                videoPath: dataUrlOrPath,
                userId,
              });

              console.log(
                `✓ Video uploaded successfully on attempt ${attempt}`
              );
              return { videoUrl, renderAttempt: attempt };
            } catch (error: unknown) {
              const baseError =
                error instanceof Error ? error : new Error(String(error));
              const renderError = baseError as RenderProcessError;

              const rawMessage = (renderError.message || "").trim();
              const normalizedMessage = rawMessage.length
                ? rawMessage
                : String(error || "").trim() || "Unknown error";
              const stack = renderError.stack;
              const stderr = renderError.stderr;
              const stdout = renderError.stdout;
              const exitCode = renderError.exitCode;
              const preview = (value?: string, limit = 800) =>
                value && value.length > limit
                  ? `${value.slice(0, limit)}…`
                  : value;
              const errorDetails = {
                message: normalizedMessage,
                stack,
                stderr,
                stdout,
                exitCode,
              };

              failedAttempts.push({
                attemptNumber: attempt,
                script: currentScript,
                error: errorDetails,
              });

              console.error(
                `Render attempt ${attempt} failed:`,
                normalizedMessage
              );

              console.log("[manim-render] Prepared error feedback for LLM", {
                attempt,
                exitCode,
                message: normalizedMessage,
                stderrPreview: preview(stderr),
                stdoutPreview: preview(stdout),
                stackPreview: preview(stack),
              });

              // If this was the last attempt, throw the error
              if (attempt === MAX_RETRIES) {
                // Surface the original error with context so upstream handlers can log full details
                const finalError = renderError as RenderProcessError & {
                  attempt?: number;
                };
                finalError.attempt = attempt;
                throw finalError;
              }

              // Regenerate script with error feedback for next attempt
              await jobStore.setProgress(jobId!, {
                details: [
                  normalizedMessage,
                  exitCode !== undefined ? `exitCode=${exitCode}` : undefined,
                  stderr ? `stderr: ${stderr.substring(0, 500)}` : undefined,
                ]
                  .filter(Boolean)
                  .join(" | "),
              });
              console.log(
                `Regenerating script for attempt ${
                  attempt + 1
                } with last error: ${normalizedMessage}`
              );
              currentScript = await regenerateManimScriptWithError({
                prompt,
                voiceoverScript,
                previousScript: currentScript,
                error: normalizedMessage,
                errorDetails,
                attemptNumber: attempt,
                attemptHistory: failedAttempts,
              });
              await jobStore.setProgress(jobId!, {
                step: `verifying regenerated script`,
              });
              const unverifiedRegenScript = currentScript;
              currentScript = await verifyScriptWithAutoFix({
                scriptToCheck: currentScript,
                context: `regeneration attempt ${attempt + 1}`,
                narration: voiceoverScript,
              });

              console.log(
                `✅ Verification complete for attempt ${
                  attempt + 1
                }. Using verified regenerated script.`,
                {
                  unverifiedLength: unverifiedRegenScript.length,
                  verifiedLength: currentScript.length,
                  changed: unverifiedRegenScript !== currentScript,
                }
              );
            }
          }

          // This should never be reached due to the throw above, but TypeScript needs it
          throw new Error("Unexpected end of retry loop");
        }
      );

      if (jobId) {
        await jobStore.setProgress(jobId, { progress: 95, step: "finalizing" });
        await jobStore.setReady(jobId, videoUrl!);
      }

      // Fire-and-forget YouTube upload after UploadThing is ready
      const ytTitle = buildYouTubeTitle({ prompt, voiceoverScript });
      await step.sendEvent("dispatch-youtube-upload", {
        name: "video/youtube.upload.request",
        data: {
          videoUrl: videoUrl!,
          title: ytTitle,
          description: `Generated by eduvids for: ${prompt}`,
          voiceoverScript: voiceoverScript,
          jobId,
          userId,
        },
      });

      return {
        success: true,
        videoUrl: videoUrl,
        prompt,
        userId,
        chatId,
        generatedAt: new Date().toISOString(),
        voiceoverLength: voiceoverScript.length,
        renderAttempts: renderAttempt,
        retriedAfterError: renderAttempt > 1,
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("Error in generateVideo function:", errorMessage);
      if (jobId) {
        await jobStore.setError(jobId, errorMessage);
      }
      throw err;
    }
  }
);

export const uploadVideoToYouTube = inngest.createFunction(
  { id: "upload-video-to-youtube", timeouts: { start: "15m", finish: "30m" } },
  { event: "video/youtube.upload.request" },
  async ({ event, step }) => {
    const { videoUrl, title, description, jobId, voiceoverScript } =
      event.data as {
        videoUrl: string;
        title: string;
        description?: string;
        jobId?: string;
        voiceoverScript?: string;
      };

    try {
      const yt = await step.run("upload-to-youtube", async () => {
        return await uploadToYouTube({
          videoUrl,
          prompt: title,
          description,
          voiceoverScript: voiceoverScript,
          tags: ["education", "manim", "math", "science"],
        });
      });

      await step.run("log-youtube-success", async () => {
        console.log("YouTube upload complete", yt);
      });

      return { success: true, ...yt };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await step.run("log-youtube-failure", async () => {
        console.error("YouTube upload failed", errorMessage);
      });
      if (jobId) {
      }
      throw err;
    }
  }
);
