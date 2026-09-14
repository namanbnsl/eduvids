"use server";

import { generateText } from "ai";
import { GROQ_MODEL_IDS, selectGroqModel } from "@/lib/groq-provider";

const FALLBACK_TOPICS = [
  "Why Soap Bubbles Solve Geometry Problems — Visualized",
  "Saturn's Rings in 3D: Why They Form Such Thin Disks",
  "The Hidden Mathematics of Honeycombs — Visualized",
  "Neutrinos Passing Straight Through Earth — Visualized in 3D",
  "Turbulence in 3D: Why Prediction Breaks Down",
  "How Ant Colonies Find the Shortest Path — Visualized",
  "The Physics of a Spinning Coin — Visualized in 3D",
  "Imaginary Numbers and Real Waves — Visualized",
  "Why Some Infinities Are Larger — Visualized",
  "How GPS Bends Time: Relativity Visualized",
  "Soap Films and Minimal Surfaces — Visualized in 3D",
  "How Quantum Tunneling Powers the Sun — Visualized",
];

const VISUAL_HOOK_PATTERN =
  /\b(?:visual|visually|visualized|visualised|3d|animated)\b/i;

function normalizeTopic(topic: string): string {
  return topic.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

function fallbackTopics(excludedTopics: string[]): string[] {
  const excluded = new Set(excludedTopics.map(normalizeTopic));
  const available = FALLBACK_TOPICS.filter(
    (topic) => !excluded.has(normalizeTopic(topic)),
  );
  const pool = available.length >= 2 ? available : FALLBACK_TOPICS;

  return [...pool].sort(() => Math.random() - 0.5).slice(0, 2);
}

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

export async function generateTopics(
  excludedTopics: string[] = [],
): Promise<string[]> {
  const exclusions = excludedTopics
    .filter((topic) => typeof topic === "string")
    .map((topic) => topic.trim())
    .filter(Boolean)
    .slice(-12);
  const system =
    "You package ideas for eduvids, a cinematic visual math and science channel. Generate title-ready video ideas whose visual treatment is unmistakable.";
  const prompt = [
    "Generate exactly two title-ready ideas for 5-minute animated educational videos.",
    "Every title MUST explicitly include at least one visual hook: Visualized, Visually, In 3D, or Animated. The cards should immediately promise something viewers will see, not read like bare textbook topics.",
    "Make the subject and the visual insight specific. Create curiosity using natural structures such as Why, How, What, or a surprising contrast.",
    "Aim for 45-65 characters and never exceed 80. Use natural title case, not all caps.",
    "Avoid generic words such as Introduction, Basics, Lesson, and vague clickbait.",
    'Match this style: "What Even Is a Tensor? Visualized From 0D to 3D" / "Why Does Gravity Bend Light? Visualized in 3D" / "How Fourier Transforms Reveal Hidden Frequencies — Visually".',
    "Choose two substantially different fields, vary the title structures, and avoid rephrasing any excluded topic.",
    `Excluded recent topics: ${JSON.stringify(exclusions)}`,
    `Variation seed: ${crypto.randomUUID()}`,
    'Return ONLY a JSON array of two short phrases, like "The physics of black holes".',
  ].join("\n");

  try {
    const { text } = await generateText({
      model: selectGroqModel(GROQ_MODEL_IDS.gptOss),
      system,
      prompt,
      temperature: 0.9,
    });

    const excluded = new Set(exclusions.map(normalizeTopic));
    const topics = coerceTopics(text).filter(
      (topic, index, allTopics) =>
        topic.length <= 80 &&
        VISUAL_HOOK_PATTERN.test(topic) &&
        !excluded.has(normalizeTopic(topic)) &&
        allTopics.findIndex(
          (candidate) => normalizeTopic(candidate) === normalizeTopic(topic),
        ) === index,
    );

    if (topics.length === 2) {
      return topics;
    }
  } catch (error) {
    console.error("Failed to generate suggested topics", error);
  }

  return fallbackTopics(exclusions);
}
