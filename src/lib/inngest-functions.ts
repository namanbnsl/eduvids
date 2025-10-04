import { inngest } from "./inngest";
import {
  generateManimScript,
  generateVoiceoverScript,
  regenerateManimScriptWithError,
  // verifyManimScript,
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
      const script = await step.run("generate-manim-script", async () => {
        return await generateManimScript({
          prompt,
          voiceoverScript,
        });
      });

      console.log("Generated Manim script", { scriptLength: script.length });

      // Verify and auto-fix the generated Manim script before attempting render
      // await jobStore.setProgress(jobId!, {
      //   progress: 38,
      //   step: "verifying script",
      // });
      // script = await step.run("verify-manim-script-initial", async () => {
      //   let current = script;
      //   const MAX_VERIFY_PASSES = 2;
      //   for (let pass = 1; pass <= MAX_VERIFY_PASSES; pass++) {
      //     const result = await verifyManimScript({
      //       prompt,
      //       voiceoverScript,
      //       script: current,
      //     });
      //     if (result.ok) return current;
      //     if (result.fixedScript && result.fixedScript.trim().length > 0) {
      //       console.log(
      //         `Verification pass ${pass} produced a fixed script (length: ${result.fixedScript.length}).`
      //       );
      //       current = result.fixedScript;
      //       continue;
      //     }
      //     console.warn(
      //       `Verification pass ${pass} reported issues but did not return a fix: ${
      //         result.error || "unknown"
      //       }`
      //     );
      //     break;
      //   }
      //   return current;
      // });

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

              // // Verify and auto-fix regenerated script before next render attempt
              // await jobStore.setProgress(jobId!, {
              //   step: `verifying regenerated script`,
              // });
              // const verifyResult = await verifyManimScript({
              //   prompt,
              //   voiceoverScript,
              //   script: currentScript,
              // });
              // if (!verifyResult.ok && verifyResult.fixedScript) {
              //   console.log(
              //     `Applied verification fix for attempt ${
              //       attempt + 1
              //     } (length: ${verifyResult.fixedScript.length}).`
              //   );
              //   currentScript = verifyResult.fixedScript;
              // }

              console.log(
                `Regenerated script for attempt ${attempt + 1}, length: ${
                  currentScript.length
                }`
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
