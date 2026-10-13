import type { ScenePlanEntry } from "@/lib/llm";
import type { StoryboardScene } from "@/lib/types";

const MAX_CAPTION = 140;

function firstSentence(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  const match = clean.match(/^.+?[.!?](?=\s|$)/);
  const sentence = match ? match[0] : clean;
  return sentence.length > MAX_CAPTION
    ? `${sentence.slice(0, MAX_CAPTION - 1).trimEnd()}…`
    : sentence;
}

/**
 * The viewer-facing outline of a scene plan: one line of narration per scene,
 * grouped under the chapter it opens. Shown while the video renders.
 */
export function toStoryboard(
  scenePlan: Pick<ScenePlanEntry, "chapterTitle" | "narration">[],
): StoryboardScene[] {
  return scenePlan
    .map((scene) => ({
      chapter: scene.chapterTitle?.trim() || undefined,
      caption: firstSentence(scene.narration ?? ""),
    }))
    .filter((scene) => scene.caption.length > 0);
}
