import { inngest } from "./inngest";
import {
  generateManimScript,
  generateVoiceoverScript,
  regenerateManimScriptWithError,
  verifyManimScript,
} from "./gemini";
import { selectManimPlugins } from "./gemini";
import { manimPlugins } from "@/manim-plugins";
import { renderManimVideo } from "./e2b";
import { uploadVideo } from "./uploadthing";
import { jobStore } from "./job-store";
import { uploadToYouTube } from "./youtube";

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
    timeouts: { start: "10m", finish: "10m" },
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

      // Decide which plugins (if any) to install and feed examples for
      await jobStore.setProgress(jobId!, {
        progress: 15,
        step: "selecting plugins",
      });
      const {
        selectedPluginNames,
        selectedPluginExamples,
        installCommands,
        pluginImportHints,
      } = await step.run("select-and-prepare-plugins", async () => {
        // Ask model to pick from available plugins
        const selectedNames = await selectManimPlugins({
          prompt,
          voiceoverScript,
          plugins: manimPlugins.map((p) => ({
            name: p.name,
            description: p.description,
          })),
        });

        const selected = manimPlugins.filter((p) =>
          selectedNames.includes(p.name)
        );
        const examples = selected.map((p) => p.basicExample);
        const hints = examples
          .flatMap((ex) =>
            ex
              .split(/\r?\n/)
              .map((l) => l.trim())
              .filter((l) => l.startsWith("from ") || l.startsWith("import "))
          )
          .filter((v, i, a) => a.indexOf(v) === i);
        return {
          selectedPluginNames: selected.map((p) => p.name),
          selectedPluginExamples: examples,
          installCommands: selected.map((p) => p.installCommand),
          pluginImportHints: hints,
        };
      });

      await jobStore.setProgress(jobId!, {
        progress: 30,
        step: "generating manim script",
      });
      let script = await step.run("generate-manim-script", async () => {
        return await generateManimScript({
          prompt,
          voiceoverScript,
          pluginExamples: selectedPluginExamples,
          selectedPluginNames,
          pluginImportHints,
        });
      });

      console.log("Generated Manim script", { scriptLength: script.length });

      // New: Verify and optionally auto-fix the script with Gemini before rendering
      await jobStore.setProgress(jobId!, {
        progress: 45,
        step: "verifying script",
      });
      const verified = await step.run("verify-manim-script", async () => {
        return await verifyManimScript({
          prompt,
          voiceoverScript,
          script,
        });
      });

      if (!verified.ok) {
        console.warn("Pre-render verification failed", verified.error);
        if (verified.fixedScript && verified.fixedScript.length > 0) {
          console.log("Using auto-fixed script from verification step");
          script = verified.fixedScript;
        } else {
          throw new Error(
            `Script verification failed and no fix was provided: ${
              verified.error ?? "unknown error"
            }`
          );
        }
      }

      // Render video with retry logic
      await jobStore.setProgress(jobId!, {
        progress: 55,
        step: "rendering video",
      });
      const { videoUrl, renderAttempt } = await step.run(
        "render-video-with-retries",
        async () => {
          const MAX_RETRIES = 3;
          let currentScript = script;
          let lastError: Error | null = null;

          for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
              console.log(`Render attempt ${attempt}/${MAX_RETRIES}...`);

              // Mid-render heartbeat
              await jobStore.setProgress(jobId!, {
                progress: Math.min(55 + attempt * 5, 80),
                step: `rendering attempt ${attempt}`,
              });
              const dataUrlOrPath = await renderManimVideo({
                script: currentScript,
                prompt,
                preInstallCommands: installCommands,
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
              lastError =
                error instanceof Error ? error : new Error(String(error));
              console.error(
                `Render attempt ${attempt} failed:`,
                lastError.message
              );

              // If this was the last attempt, throw the error
              if (attempt === MAX_RETRIES) {
                throw new Error(
                  `Failed to render video after ${MAX_RETRIES} attempts. Last error: ${lastError.message}`
                );
              }

              // Regenerate script with error feedback for next attempt
              await jobStore.setProgress(jobId!, {
                details: lastError.message,
              });
              console.log(`Regenerating script for attempt ${attempt + 1}...`);
              currentScript = await regenerateManimScriptWithError({
                prompt,
                voiceoverScript,
                previousScript: currentScript,
                error: lastError.message,
                attemptNumber: attempt,
              });

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
          description: `Generated by scimath-vids for: ${prompt}`,
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
