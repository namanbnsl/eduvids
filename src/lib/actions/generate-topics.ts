"use server";

import { generateText } from "ai";
import { GROQ_MODEL_IDS, selectGroqModel } from "@/lib/groq-provider";
import {
  buildTopicPrompt,
  parseSuggestedTopics,
  sanitizeTopicHistory,
  selectSuggestedTopics,
  type SuggestedTopic,
} from "@/lib/suggested-topics";

export async function generateTopics(
  excludedTopics: SuggestedTopic[] = [],
): Promise<SuggestedTopic[]> {
  const history = sanitizeTopicHistory(excludedTopics);
  let generated: SuggestedTopic[] = [];

  try {
    const { text } = await generateText({
      model: selectGroqModel(GROQ_MODEL_IDS.gptOss),
      system:
        "You package ideas for eduvids, a cinematic visual math and science channel. Generate title-ready video ideas whose visual treatment is unmistakable.",
      prompt: buildTopicPrompt(history),
      temperature: 0.9,
      abortSignal: AbortSignal.timeout(15_000),
      maxRetries: 0,
    });
    generated = parseSuggestedTopics(text);
  } catch (error) {
    console.error("Failed to generate suggested topics", error);
  }

  return selectSuggestedTopics(generated, history);
}
