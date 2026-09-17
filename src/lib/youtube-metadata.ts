import { jsonrepair } from "jsonrepair";

const TITLE_LIMIT = 80;
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
    if (/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token) || token === "x" || token === "pi") {
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
        title.length >= 25 &&
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
    ({
      thumbnailText,
      visualConcept,
      visualType,
      mathNotation,
      plotExpression,
      plotXRange,
    }) => ({
      text: thumbnailText ?? "",
      visualConcept: visualConcept ?? "",
      visualType,
      mathNotation: mathNotation ?? "",
      plotExpression: plotExpression ?? "",
      plotXRange,
    }),
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
