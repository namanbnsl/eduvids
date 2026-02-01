import { serve } from "@upstash/workflow/nextjs";

import { generateVoiceoverScript } from "@/lib/llm";
import { jobStore } from "@/lib/job-store";
import { searchForTopic, formatSourcesForPrompt } from "@/lib/tavily";
import { updateJobProgress } from "@/lib/workflow/utils/progress";
import { qstashClientWithBypass } from "@/lib/workflow/client";
import { getConvexClient, api } from "@/lib/convex-server";

import type { VideoGenerationPayload } from "@/lib/workflow/types";

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

    const variant = rawVariant === "short" ? "short" : "video";
    const generationPrompt =
      variant === "short"
        ? `${prompt}\n\nThe final output must be a YouTube-ready vertical (9:16) short under one minute. Keep narration concise and design visuals for portrait orientation. The layout system automatically provides larger font constants optimized for portrait (FONT_TITLE=46, FONT_HEADING=36, FONT_BODY=32, FONT_CAPTION=28, FONT_LABEL=26) - always use these constants instead of hardcoded sizes. Split copy across multiple lines for readability, keep visual groups within the safe content area, and leave proper clearance between arrows, labels, and nearby objects using the auto-calculated margins.`
        : prompt;

    console.log(
      `🎬 Starting ${
        variant === "short" ? "vertical short" : "full video"
      } generation for prompt: "${prompt}"`,
    );

    // Step 0: Search for information via Tavily (use original prompt, not augmented)
    const searchResult = await context.run("search-web-sources", async () => {
      if (jobId) {
        await updateJobProgress(jobId, {
          progress: 2,
          step: "Researching topic",
          details: "Searching the web",
        });
      }
      const result = await searchForTopic(prompt);
      console.log(
        `🔍 Tavily search completed: ${result.sources.length} sources found`,
      );
      return result;
    });

    // Store sources in job for UI display
    const sources = searchResult.sources;
    if (sources.length > 0) {
      if (jobId) {
        await context.run("store-sources", async () => {
          console.log(`📚 Storing ${sources.length} sources for job ${jobId}`);
          await jobStore.setSources(jobId, sources);
        });
      }
      console.log(`🔍 Found ${sources.length} web sources for topic`);
    } else {
      console.log(`⚠️ No sources found from Tavily search`);
    }

    // Augment prompt with web research if available
    const researchContext = formatSourcesForPrompt(sources);
    const augmentedPrompt = researchContext
      ? `${generationPrompt}\n\n${researchContext}`
      : generationPrompt;

    // Step 1: Generate voiceover script
    const voiceoverScript = await context.run(
      "generate-voiceover-script",
      async () => {
        await updateJobProgress(jobId, {
          progress: 5,
          step: "Creating narration",
          details: "Writing script",
        });
        return generateVoiceoverScript({
          prompt: augmentedPrompt,
          sessionId: chatId,
        });
      },
    );

    console.log("✅ Voiceover script generated", {
      length: voiceoverScript.length,
    });

    // Step 2: Store voiceover draft and wait for user approval
    await context.run("store-voiceover-for-approval", async () => {
      if (jobId) {
        // Store in KV for immediate access
        await jobStore.setVoiceoverPending(jobId, voiceoverScript);

        // Store in Convex for persistence (survives KV TTL and page reloads)
        try {
          const convexClient = getConvexClient();
          await convexClient.mutation(api.videos.setVoiceoverDraft, {
            jobId,
            voiceoverDraft: voiceoverScript,
            sources: sources.length > 0 ? sources : undefined,
          });
        } catch (err) {
          console.error("Failed to store voiceover in Convex:", err);
        }

        await updateJobProgress(jobId, {
          progress: 10,
          step: "Awaiting voiceover approval",
          details: "Review and approve the voiceover to continue",
        });
      }
    });

    // Return - the workflow will be continued by the approve endpoint via /api/workflow/continue-video
    console.log("⏸️ Workflow paused - waiting for voiceover approval");
    return {
      success: true,
      stage: "awaiting_voiceover_approval",
      jobId,
      prompt,
      userId,
      chatId,
      variant,
      voiceoverLength: voiceoverScript.length,
      message: "Voiceover generated and awaiting user approval",
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
