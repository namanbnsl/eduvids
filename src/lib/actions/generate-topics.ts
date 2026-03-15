"use server";

import { generateText } from "ai";
import { GROQ_MODEL_IDS, selectGroqModel } from "@/lib/groq-provider";

function coerceTopics(text: string): string[] {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (Array.isArray(parsed)) {
        const items = parsed
          .filter((item) => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean);
        if (items.length >= 2) {
          return items.slice(0, 2);
        }
      }
    } catch {
      // fall through to heuristic parsing
    }
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\s\-*\d.)]+/, "").trim())
    .filter(Boolean);

  let candidates = lines;
  if (candidates.length < 2) {
    candidates = trimmed
      .split(/[;]+/)
      .map((part) => part.trim())
      .filter(Boolean);
  }

  return candidates.slice(0, 2);
}

export async function generateTopics(): Promise<string[]> {
  const system =
    "You generate concise, specific educational video topics for short animated explainers.";
  const prompt = [
    "Generate exactly two topic ideas for a 5-minute educational video that would benefit from beautiful, precise animations (e.g., relativity, Laplace transforms).",
    "Topics should be interesting, not too common, and written in English.",
    'Return ONLY a JSON array of two short phrases, like "The physics of black holes".',
  ].join("\n");

  const { text } = await generateText({
    model: selectGroqModel(GROQ_MODEL_IDS.gptOss),
    system,
    prompt,
    temperature: 0.7,
  });

  const topics = coerceTopics(text);
  if (topics.length === 2) {
    return topics;
  }

  return [
    "The geometry of spacetime curvature",
    "The dynamics of chaotic double pendulums",
  ];
}
