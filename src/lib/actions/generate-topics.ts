"use server";

import { generateText } from "ai";
import { GROQ_MODEL_IDS, selectGroqModel } from "@/lib/groq-provider";
import { withTracing } from "@posthog/ai";
import { PostHog } from "posthog-node";

const phClient = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
  host: process.env.NEXT_PUBLIC_POSTHOG_HOST!,
});

export async function generateTopics(): Promise<string[]> {
  if (process.env.NODE_ENV === "production") {
    try {
      // Create a new provider instance to rotate API keys
      const { text } = await generateText({
        model: withTracing(
          selectGroqModel(GROQ_MODEL_IDS.gptOss),
          phClient,
          {}
        ),
        prompt: `Generate 2 fun and interesting video/short topic ideas for an educational content platform focused on math, physics, and chemistry. It shouldn't be very hard. The person should have some idea on what it is about.

Topics should:
- Be fascinating and visually engaging 
- Be concise and clear (under 60 characters each)
- Focus on cool phenomena, tough concepts, school related ideas or surprising facts.
- Be actionable prompts like "How do X work?" or "Why does Y happen?" or "What is Z?"
- Mix spectacular phenomena with fundamental concepts

Examples: What is a mole?, Why is the sky blue?, How do magnets work?, What causes lightning?

Return ONLY a JSON array of 2 strings, like this:
["topic 1", "topic 2"]

No explanation, no markdown, just the JSON array.`,
        temperature: 0.9,
      });

      const cleanText = text
        .trim()
        .replace(/```json\n?/g, "")
        .replace(/```/g, "");
      const topics = JSON.parse(cleanText);

      if (!Array.isArray(topics)) {
        throw new Error("Invalid response format");
      }

      return topics.slice(0, 2);
    } catch (error) {
      console.error("Failed to generate topics:", error);

      return ["How do nuclear reactions work?", "Why do rainbows form?"];
    }
  } else {
    console.log(
      "[generateTopics] In development mode, returning hardcoded topics"
    );
    return ["How do nuclear reactions work?", "Why do rainbows form?"];
  }
}
