import { inngest } from "./inngest";
import { generateManimScript, generateVoiceoverScript } from "./gemini";
import { renderManimVideo } from "./e2b";
import { uploadVideo } from "./uploadthing";
import { jobStore } from "./job-store";

export const generateVideo = inngest.createFunction(
  { id: "generate-manim-video" },
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

      // Step 2: Generate Manim Python script with voiceover
      const script = await step.run("generate-manim-script", async () => {
        return await generateManimScript({ prompt, voiceoverScript });
      });

      console.log("Generated Manim script", { scriptLength: script.length });

      // Step 3 & 4 combined: Render and upload within a single step to avoid persisting large payloads
      const videoUrl = await step.run("render-and-upload-video", async () => {
        const dataUrlOrPath = await renderManimVideo({ script, prompt });
        return await uploadVideo({ videoPath: dataUrlOrPath, userId });
      });

      console.log("Video uploaded successfully:", videoUrl);

      // Update job store on success
      if (jobId) {
        await jobStore.setReady(jobId, videoUrl);
      }

      // Return the final result
      return {
        success: true,
        videoUrl,
        prompt,
        userId,
        chatId,
        generatedAt: new Date().toISOString(),
        scriptLength: script.length,
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

