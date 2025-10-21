"use server";

import { generateText } from "ai";
import { createGoogleProvider } from "@/lib/google-provider";

export async function generateTopics(): Promise<string[]> {
  try {
    const google = createGoogleProvider();
    const model = google("gemini-2.5-flash-lite");

    const { text } = await generateText({
      model,
      prompt: `Generate 2 fun and interesting video/short topic ideas for an educational content platform focused on math, physics, and chemistry.

Topics should:
- Focus ONLY on math, physics, computer science/technology and chemistry
- Be fascinating and visually engaging 
- Be concise and clear (under 60 characters each)
- Focus on cool phenomena, tough concepts, or surprising facts.
- Be actionable prompts like "How do X work?" or "Why does Y happen?" or "What is Z?"
- Mix spectacular phenomena with fundamental concepts

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
}
