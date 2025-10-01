import { inngest } from "./inngest";
import { generateManimScript, generateVoiceoverScript } from "./gemini";
import { renderManimVideo } from "./e2b";
import { uploadVideo } from "./uploadthing";
import { jobStore } from "./job-store";

export const generateVideo = inngest.createFunction(
  { id: "generate-manim-video", timeouts: { start: "10m", finish: "10m" } },
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
      // Step 1: Generate voiceover narration
      const voiceoverScript = await step.run(
        "generate-voiceover-script",
        async () => {
          return await generateVoiceoverScript({ prompt });
        }
      );

      console.log("Generated voiceover script", {
        length: voiceoverScript.length,
      });

      // Steps 2-4: Generate Manim script, render, and upload
      // If an error occurs during these steps (e.g., due to a bad script),
      // retry from generating the Manim script onward ONCE, keeping the same voiceover.
      let videoUrl: string | null = null;
      try {
        const script = await step.run("generate-manim-script", async () => {
          return await generateManimScript({ prompt, voiceoverScript });
        });

        console.log("Generated Manim script", { scriptLength: script.length });

        videoUrl = await step.run("render-and-upload-video", async () => {
          const dataUrlOrPath = await renderManimVideo({ script, prompt });
          return await uploadVideo({ videoPath: dataUrlOrPath, userId });
        });

        console.log("Video uploaded successfully:", videoUrl);
      } catch (firstErr: any) {
        console.warn(
          "Primary attempt failed after voiceover; retrying from Manim script generation with same voiceover...",
          firstErr
        );

        const retryScript = await step.run(
          "retry-generate-manim-script",
          async () => {
            return await generateManimScript({ prompt, voiceoverScript });
          }
        );

        console.log("Retry Manim script generated", {
          scriptLength: retryScript.length,
        });

        videoUrl = await step.run("retry-render-and-upload-video", async () => {
          const dataUrlOrPath = await renderManimVideo({
            script: retryScript,
            prompt,
          });
          return await uploadVideo({ videoPath: dataUrlOrPath, userId });
        });

        console.log("Video uploaded successfully on retry:", videoUrl);
      }

      // Update job store on success
      if (jobId) {
        await jobStore.setReady(jobId, videoUrl!);
      }

      // Return the final result
      return {
        success: true,
        videoUrl: videoUrl!,
        prompt,
        userId,
        chatId,
        generatedAt: new Date().toISOString(),
        // We do not persist the script; expose voiceover length for traceability
        voiceoverLength: voiceoverScript.length,
      };
    } catch (err: any) {
      console.error("Error in generateVideo function:", err);
      if (jobId) {
        await jobStore.setError(jobId, err?.message ?? "Unknown error");
      }
      throw err;
    }
  }
);
