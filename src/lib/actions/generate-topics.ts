"use server";

import { generateText } from "ai";
import { createGoogleProvider } from "@/lib/google-provider";

export async function generateTopics(): Promise<string[]> {
  try {
    const google = createGoogleProvider();
    const model = google("gemini-2.5-flash-lite");

    const { text } = await generateText({
      model,
      prompt: `Generate 8 engaging and diverse video/short topic ideas for an educational content platform. 

Topics should:
- Cover various subjects (science, math, history, technology, nature, space, physics, chemistry, biology, etc.)
- Be concise and clear (under 60 characters each)
- Be interesting and visually engaging for animated videos
- Mix fundamental concepts with fascinating phenomena
- Be actionable prompts like "Explain X" or "How does Y work?"

Return ONLY a JSON array of 8 strings, like this:
["topic 1", "topic 2", "topic 3", ...]

No explanation, no markdown, just the JSON array.`,
      temperature: 0.9,
    });

    const cleanText = text.trim().replace(/```json\n?/g, "").replace(/```/g, "");
    const topics = JSON.parse(cleanText);

    if (!Array.isArray(topics)) {
      throw new Error("Invalid response format");
    }

    return topics.slice(0, 8);
  } catch (error) {
    console.error("Failed to generate topics:", error);
    
    return [
      "How does photosynthesis work?",
      "Explain the Pythagorean theorem",
      "What causes earthquakes?",
      "How do black holes form?",
      "The water cycle explained",
      "Newton's laws of motion",
      "How does DNA replication work?",
      "The periodic table basics",
    ];
  }
}
