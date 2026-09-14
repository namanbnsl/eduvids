import { jsonrepair } from "jsonrepair";

const TITLE_LIMIT = 80;
const BLOCKED_TITLE_WORDS = /\b(explained|basics|introduction|lesson)\b/i;

export interface VideoTitleSet {
  selected: string;
  candidates: [string, string, string];
}

export interface RelatedYouTubeVideo {
  videoId: string;
  title: string;
  watchUrl: string;
}

function cleanTitle(value: string): string {
  return value
    .replace(/^\s*(?:\d+[.)]|[-*])\s*/, "")
    .replace(/^["']|["']$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseStringArray(raw: string): string[] {
  const withoutFences = raw
    .replace(/```(?:json)?\s*/gi, "")
    .replace(/```/g, "")
    .trim();
  const arrayMatch = withoutFences.match(/\[[\s\S]*\]/);

  if (arrayMatch) {
    try {
      const parsed = JSON.parse(jsonrepair(arrayMatch[0]));
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (item): item is string => typeof item === "string",
        );
      }
    } catch {
      // Fall through to line parsing.
    }
  }

  return withoutFences.split(/\r?\n/);
}

export function parseVideoTitleSet(raw: string): VideoTitleSet {
  const candidates = parseStringArray(raw)
    .map(cleanTitle)
    .filter(
      (title, index, titles) =>
        title.length >= 25 &&
        title.length <= TITLE_LIMIT &&
        !BLOCKED_TITLE_WORDS.test(title) &&
        titles.indexOf(title) === index,
    )
    .slice(0, 3);

  if (candidates.length !== 3) {
    throw new Error("Title generation did not return three usable candidates");
  }

  return {
    selected: candidates[0],
    candidates: candidates as [string, string, string],
  };
}

function descriptionLines(copy: string): string[] {
  const normalized = copy
    .replace(/^["']|["']$/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
  const suppliedLines = normalized
    .split(/\r?\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (suppliedLines.length >= 2) return suppliedLines.slice(0, 2);

  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
  return sentences.length >= 2 ? sentences.slice(0, 2) : [normalized];
}

export function buildYouTubeDescription({
  salesCopy,
  topic,
  previousVideo,
}: {
  salesCopy?: string;
  topic?: string;
  previousVideo?: RelatedYouTubeVideo;
}): string {
  const topicExcerpt = (topic?.trim() || "this idea")
    .replace(/\s+/g, " ")
    .slice(0, 140)
    .replace(/[.!?]+$/, "");
  const opening = salesCopy?.trim()
    ? descriptionLines(salesCopy).join("\n")
    : [
        `What is really happening inside ${topicExcerpt}?`,
        "Precise animation builds the intuition step by step until the hidden pattern becomes clear.",
      ].join("\n");
  const blocks = [opening];

  if (previousVideo) {
    blocks.push(`Previous: ${previousVideo.title} → ${previousVideo.watchUrl}`);
  }

  blocks.push("Create your own visual explanation at https://eduvids.app");
  return blocks.join("\n\n");
}

export function buildPreviousVideoComment(
  previousVideo: RelatedYouTubeVideo,
): string {
  return `Previous: ${previousVideo.title} → ${previousVideo.watchUrl}`;
}
