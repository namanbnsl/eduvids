import { jsonrepair } from "jsonrepair";

const TITLE_LIMIT = 80;
const TITLE_MINIMUM = 20;
// Slot B is always the visual-only thumbnail, so every video ships one
// text-free variant for A/B testing against the two headline variants.
export const VISUAL_ONLY_THUMBNAIL_INDEX = 1;
const BLOCKED_TITLE_WORDS = /\b(explained|basics|introduction|lesson)\b/i;

export interface VideoTitleSet {
  selected: string;
  candidates: [string, string, string];
  thumbnailConcepts?: [ThumbnailConcept, ThumbnailConcept, ThumbnailConcept];
}

export const THUMBNAIL_VISUAL_TYPES = [
  "function_plot",
  "complex_plane",
  "geometry",
  "transformation",
  "vector_field",
  "wave",
  "orbit",
  "probability",
  "network",
  "atom",
  "surface_3d",
  "solid_3d",
] as const;

export type ThumbnailVisualType = (typeof THUMBNAIL_VISUAL_TYPES)[number];

export interface ThumbnailConcept {
  text: string;
  visualConcept: string;
  visualType?: ThumbnailVisualType;
  mathNotation?: string;
  plotExpression?: string;
  plotXRange?: [number, number];
}

export interface ThumbnailPair {
  title: string;
  thumbnailUrl: string;
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

export function sanitizeThumbnailPlotExpression(value: unknown): string {
  if (typeof value !== "string") return "";
  const expression = value.replace(/\s+/g, "").replaceAll("^", "**");
  if (!expression || expression.length > 100 || expression.includes("//")) {
    return "";
  }
  const tokens = expression.match(
    /sin|cos|tan|exp|log|sqrt|abs|pi|x|(?:\d+(?:\.\d*)?|\.\d+)|\*\*|[()+\-*/]/g,
  );
  if (!tokens || tokens.join("") !== expression) return "";
  const tokenList = tokens;

  const functions = new Set(["sin", "cos", "tan", "exp", "log", "sqrt", "abs"]);
  let cursor = 0;
  const take = (token: string) =>
    tokenList[cursor] === token ? ((cursor += 1), true) : false;
  const parsePrimary = (): boolean => {
    const token = tokenList[cursor];
    if (!token) return false;
    if (
      /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token) ||
      token === "x" ||
      token === "pi"
    ) {
      cursor += 1;
      return true;
    }
    if (functions.has(token)) {
      cursor += 1;
      return take("(") && parseExpression() && take(")");
    }
    if (take("(")) return parseExpression() && take(")");
    return false;
  };
  const parsePower = (): boolean => {
    if (!parsePrimary()) return false;
    return !take("**") || parseUnary();
  };
  const parseUnary = (): boolean => {
    if (take("+") || take("-")) return parseUnary();
    return parsePower();
  };
  const parseTerm = (): boolean => {
    if (!parseUnary()) return false;
    while (tokenList[cursor] === "*" || tokenList[cursor] === "/") {
      cursor += 1;
      if (!parseUnary()) return false;
    }
    return true;
  };
  function parseExpression(): boolean {
    if (!parseTerm()) return false;
    while (tokenList[cursor] === "+" || tokenList[cursor] === "-") {
      cursor += 1;
      if (!parseTerm()) return false;
    }
    return true;
  }

  return parseExpression() && cursor === tokenList.length ? expression : "";
}

function cleanPlotRange(value: unknown): [number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 2) return undefined;
  const [minimum, maximum] = value;
  if (
    typeof minimum !== "number" ||
    typeof maximum !== "number" ||
    !Number.isFinite(minimum) ||
    !Number.isFinite(maximum) ||
    minimum < -20 ||
    maximum > 20 ||
    maximum - minimum < 0.5
  ) {
    return undefined;
  }
  return [minimum, maximum];
}

function parseCandidateArray(raw: string): unknown[] {
  const withoutFences = raw
    .replace(/```(?:json)?\s*/gi, "")
    .replace(/```/g, "")
    .trim();
  const arrayMatch = withoutFences.match(/\[[\s\S]*\]/);

  if (arrayMatch) {
    try {
      const parsed = JSON.parse(jsonrepair(arrayMatch[0]));
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // Fall through to line parsing.
    }
  }

  return withoutFences.split(/\r?\n/);
}

export function parseVideoTitleSet(raw: string): VideoTitleSet {
  const parsed = parseCandidateArray(raw)
    .map((candidate) => {
      if (typeof candidate === "string") {
        return { title: cleanTitle(candidate) };
      }
      if (!candidate || typeof candidate !== "object") return null;
      const record = candidate as Record<string, unknown>;
      if (typeof record.title !== "string") return null;
      return {
        title: cleanTitle(record.title),
        thumbnailText:
          typeof record.thumbnailText === "string"
            ? record.thumbnailText.replace(/\s+/g, " ").trim()
            : undefined,
        visualConcept:
          typeof record.visualConcept === "string"
            ? record.visualConcept.replace(/\s+/g, " ").trim()
            : undefined,
        visualType:
          typeof record.visualType === "string" &&
          THUMBNAIL_VISUAL_TYPES.includes(
            record.visualType as ThumbnailVisualType,
          )
            ? (record.visualType as ThumbnailVisualType)
            : undefined,
        mathNotation:
          typeof record.mathNotation === "string" &&
          record.mathNotation.length <= 80 &&
          !/\\(?:input|include|write|openout|usepackage|href|url)\b/i.test(
            record.mathNotation,
          )
            ? record.mathNotation.trim()
            : "",
        plotExpression: sanitizeThumbnailPlotExpression(record.plotExpression),
        plotXRange: cleanPlotRange(record.plotXRange),
      };
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => {
      if (!candidate) return false;
      const { title } = candidate;
      return (
        title.length >= TITLE_MINIMUM &&
        title.length <= TITLE_LIMIT &&
        !BLOCKED_TITLE_WORDS.test(title)
      );
    })
    .filter(
      (candidate, index, candidates) =>
        candidates.findIndex(({ title }) => title === candidate.title) ===
        index,
    )
    .slice(0, 3);

  if (parsed.length !== 3) {
    throw new Error("Title generation did not return three usable candidates");
  }

  const candidates = parsed.map(({ title }) => title) as [
    string,
    string,
    string,
  ];
  const concepts = parsed.map(
    (
      {
        thumbnailText,
        visualConcept,
        visualType,
        mathNotation,
        plotExpression,
        plotXRange,
      },
      index,
    ) => {
      const visualOnly = index === VISUAL_ONLY_THUMBNAIL_INDEX;
      return {
        text: visualOnly ? "" : (thumbnailText ?? ""),
        visualConcept: visualConcept ?? "",
        visualType,
        mathNotation: visualOnly ? "" : (mathNotation ?? ""),
        plotExpression: plotExpression ?? "",
        plotXRange,
      };
    },
  ) as [ThumbnailConcept, ThumbnailConcept, ThumbnailConcept];
  const hasCompleteConcepts = concepts.every(
    ({ text, visualConcept, visualType }) =>
      (text.length === 0 ||
        (text.length >= 2 &&
          text.length <= 28 &&
          text.split(/\s+/).length <= 4)) &&
      visualConcept.length >= 3 &&
      visualConcept.length <= 120 &&
      visualType !== undefined,
  );

  return {
    selected: candidates[0],
    candidates,
    ...(hasCompleteConcepts ? { thumbnailConcepts: concepts } : {}),
  };
}

export function selectThumbnailPair(
  titles: VideoTitleSet,
  pairs: ThumbnailPair[] | undefined,
): ThumbnailPair | undefined {
  if (!pairs?.length) return undefined;
  return pairs.find((pair) => pair.title === titles.selected);
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

export interface VideoDescriptionPackage {
  hook: string;
  hashtags: string[];
  tags: string[];
}

export interface YouTubeChapter {
  start: number;
  title: string;
}

export interface SceneTiming {
  scene: string;
  seconds: number;
}

const MIN_CHAPTER_SECONDS = 10;
const MIN_CHAPTERS = 3;

function cleanHashtag(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const words = value
    .replace(/^#/, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  if (!words.length) return null;
  const tag = words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join("");
  return tag.length >= 2 && tag.length <= 30 ? `#${tag}` : null;
}

export function parseVideoDescriptionPackage(
  raw: string,
): VideoDescriptionPackage {
  const text = raw
    .replace(/```(?:json)?\s*/gi, "")
    .replace(/```/g, "")
    .trim();
  const objectMatch = text.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try {
      const parsed = JSON.parse(jsonrepair(objectMatch[0])) as Record<
        string,
        unknown
      >;
      const hookLines = (
        Array.isArray(parsed.hook) ? parsed.hook : [parsed.hook]
      )
        .filter((line): line is string => typeof line === "string")
        .map((line) => line.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .slice(0, 2);
      const hashtags = [
        ...new Set(
          (Array.isArray(parsed.hashtags) ? parsed.hashtags : [])
            .map(cleanHashtag)
            .filter((tag): tag is string => tag !== null),
        ),
      ].slice(0, 3);
      const tags = [
        ...new Set(
          (Array.isArray(parsed.tags) ? parsed.tags : [])
            .filter((tag): tag is string => typeof tag === "string")
            .map((tag) =>
              tag
                .replace(/[<>,#]/g, "")
                .replace(/\s+/g, " ")
                .trim()
                .toLowerCase(),
            )
            .filter((tag) => tag.length >= 2 && tag.length <= 40),
        ),
      ].slice(0, 12);
      if (hookLines.length) {
        return { hook: hookLines.join("\n").slice(0, 500), hashtags, tags };
      }
    } catch {
      // Fall through to treating the response as plain description copy.
    }
  }
  return {
    hook: text.replace(/^["']|["']$/g, "").slice(0, 500),
    hashtags: [],
    tags: [],
  };
}

export function formatChapterTimestamp(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}`
    : `${minutes}:${rest}`;
}

/**
 * Turns rendered scene durations plus the scene plan's chapterTitle markers
 * into YouTube chapters. YouTube only shows chapters when the first starts at
 * 0:00, there are at least three, and each lasts at least ten seconds, so
 * short sections are merged and anything that can't satisfy that is dropped.
 */
export function buildChapters(
  timings: SceneTiming[],
  plan: { sceneId: string; chapterTitle?: string }[],
): YouTubeChapter[] {
  if (!timings.length || !plan.length) return [];
  const titles = new Map(
    plan.map(({ sceneId, chapterTitle }) => [
      sceneId,
      chapterTitle?.replace(/\s+/g, " ").trim().slice(0, 60),
    ]),
  );
  const matchedByName = timings.every(({ scene }) => titles.has(scene));
  if (!matchedByName && timings.length !== plan.length) return [];

  const chapters: YouTubeChapter[] = [];
  let elapsed = 0;
  timings.forEach(({ scene, seconds }, index) => {
    const title = matchedByName
      ? titles.get(scene)
      : plan[index]?.chapterTitle?.replace(/\s+/g, " ").trim().slice(0, 60);
    if (index === 0) {
      chapters.push({ start: 0, title: title || "The question" });
    } else if (title) {
      chapters.push({ start: elapsed, title });
    }
    elapsed += seconds;
  });

  // A too-short chapter folds into the one before it; the 0:00 chapter can't
  // move, so when it is too short it absorbs the next one instead.
  const length = (index: number) =>
    (chapters[index + 1]?.start ?? elapsed) - chapters[index]!.start;
  let short = chapters.findIndex(
    (_, index) => length(index) < MIN_CHAPTER_SECONDS,
  );
  while (short !== -1 && chapters.length > 1) {
    chapters.splice(short === 0 ? 1 : short, 1);
    short = chapters.findIndex(
      (_, index) => length(index) < MIN_CHAPTER_SECONDS,
    );
  }

  return chapters.length >= MIN_CHAPTERS ? chapters : [];
}

export function buildYouTubeDescription({
  salesCopy,
  topic,
  previousVideo,
  chapters = [],
  hashtags = [],
}: {
  salesCopy?: string;
  topic?: string;
  previousVideo?: RelatedYouTubeVideo;
  chapters?: YouTubeChapter[];
  hashtags?: string[];
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

  if (chapters.length) {
    blocks.push(
      chapters
        .map(({ start, title }) => `${formatChapterTimestamp(start)} ${title}`)
        .join("\n"),
    );
  }

  if (previousVideo) {
    blocks.push(`Previous: ${previousVideo.title} → ${previousVideo.watchUrl}`);
  }

  blocks.push("Make your own visual explanation at https://eduvids.app");
  if (hashtags.length) blocks.push(hashtags.slice(0, 3).join(" "));
  return blocks.join("\n\n");
}

export function buildPreviousVideoComment(
  previousVideo: RelatedYouTubeVideo,
): string {
  return `Previous: ${previousVideo.title} → ${previousVideo.watchUrl}`;
}
