import { jsonrepair } from "jsonrepair";

const TITLE_LIMIT = 80;
const TITLE_MINIMUM = 20;
// Slot B is always the visual-only thumbnail, so every video ships one
// text-free variant to A/B test against the two headline variants.
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
  "energy_levels",
  "surface_3d",
  "solid_3d",
  "equation",
] as const;

export type ThumbnailVisualType = (typeof THUMBNAIL_VISUAL_TYPES)[number];

/** Validated, type-specific parameters for the thumbnail hero visual. */
export interface ThumbnailVisual {
  type: ThumbnailVisualType;
  notation?: string;
  expression?: string;
  xRange?: [number, number];
  highlight?: "tangent" | "area" | "point" | "none";
  at?: number;
  from?: number;
  to?: number;
  turn?: number;
  shape?: string;
  harmonics?: number;
  sides?: number;
  matrix?: [[number, number], [number, number]];
  field?: "rotation" | "source" | "saddle" | "spiral";
  eccentricity?: number;
  layers?: number[];
}

export interface ThumbnailConcept {
  /** Small uppercase topic label above the headline, e.g. "Complex numbers". */
  eyebrow: string;
  /** Two short lines at most; may contain inline $math$ and "~" to bind words. */
  headline: string;
  /** Exact substring of the headline painted in the warm accent colour. */
  accent: string;
  visualConcept: string;
  visual: ThumbnailVisual;
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

const LATEX_COMMANDS = new Set(
  (
    "frac dfrac tfrac sqrt int iint oint sum prod lim infty partial nabla cdot cdots ldots " +
    "times div pm mp mid le leq ge geq ne neq approx equiv sim simeq propto to rightarrow leftarrow " +
    "Rightarrow iff mapsto in notin subset subseteq cup cap forall exists emptyset vec hat bar dot " +
    "ddot tilde overline mathbf mathbb mathrm mathcal operatorname text left right big Big langle " +
    "rangle lfloor rfloor lceil rceil sin cos tan log ln exp det max min hl quad qquad imath jmath " +
    "ell hbar prime circ degree angle triangle perp parallel binom alpha beta gamma Gamma delta " +
    "Delta epsilon varepsilon zeta eta theta Theta vartheta iota kappa lambda Lambda mu nu xi Xi " +
    "pi Pi rho sigma Sigma tau upsilon phi Phi varphi chi psi Psi omega Omega"
  ).split(" "),
);

/** Conservative LaTeX subset for thumbnails: math only, no file or macro access. */
export function sanitizeThumbnailLatex(value: unknown): string {
  if (typeof value !== "string") return "";
  const latex = value.trim();
  if (!latex || latex.length > 90 || /[#%~`"@$]|\^\^/.test(latex)) return "";
  for (const [, command] of latex.matchAll(/\\([A-Za-z]+)/g)) {
    if (!LATEX_COMMANDS.has(command!)) return "";
  }
  let depth = 0;
  for (const char of latex) {
    if (char === "{") depth += 1;
    if (char === "}") depth -= 1;
    if (depth < 0) return "";
  }
  return depth === 0 ? latex : "";
}

/** Two-variable variant used by surface visuals: same grammar, x and y allowed. */
export function sanitizeThumbnailSurfaceExpression(value: unknown): string {
  if (typeof value !== "string") return "";
  const placeholder = value.replace(/\by\b/g, "(x)");
  if (!sanitizeThumbnailPlotExpression(placeholder)) return "";
  const expression = value.replace(/\s+/g, "").replaceAll("^", "**");
  return /^[a-z0-9.()+\-*/]+$/.test(expression) ? expression : "";
}

/** Rough visible width of copy in "average characters" (math counts its glyphs). */
export function thumbnailCopyLength(text: string): number {
  return text
    .split("$")
    .map((segment, index) =>
      index % 2
        ? segment.replace(/\\[A-Za-z]+/g, "x").replace(/[{}_^\s]/g, "").length
        : segment.replace(/~/g, " ").length,
    )
    .reduce((total, length) => total + length, 0);
}

function finiteNumber(
  value: unknown,
  minimum: number,
  maximum: number,
): number | undefined {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : undefined;
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

function pick<T extends string>(value: unknown, options: readonly T[]) {
  return typeof value === "string" && options.includes(value as T)
    ? (value as T)
    : undefined;
}

function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as T;
}

/** Keep only the parameters that are valid for the chosen visual type. */
export function sanitizeThumbnailVisual(
  type: ThumbnailVisualType,
  raw: Record<string, unknown>,
): ThumbnailVisual {
  const notation = sanitizeThumbnailLatex(raw.notation) || undefined;
  switch (type) {
    case "function_plot": {
      const xRange = cleanPlotRange(raw.xRange);
      const inRange = (value: unknown) =>
        xRange ? finiteNumber(value, xRange[0], xRange[1]) : undefined;
      return withoutUndefined({
        type,
        notation,
        expression:
          sanitizeThumbnailPlotExpression(raw.expression) || undefined,
        xRange,
        highlight: pick(raw.highlight, [
          "tangent",
          "area",
          "point",
          "none",
        ] as const),
        at: inRange(raw.at),
        from: inRange(raw.from),
        to: inRange(raw.to),
      });
    }
    case "complex_plane":
      return withoutUndefined({
        type,
        notation,
        turn: finiteNumber(raw.turn, 0.05, 0.95),
      });
    case "wave":
      return withoutUndefined({
        type,
        shape: pick(raw.shape, ["square", "sawtooth"] as const),
        harmonics: finiteNumber(raw.harmonics, 2, 6),
      });
    case "probability":
      return withoutUndefined({
        type,
        notation,
        from: finiteNumber(raw.from, -3.5, 3.5),
        to: finiteNumber(raw.to, -3.5, 3.5),
      });
    case "geometry":
      return withoutUndefined({
        type,
        notation,
        shape: pick(raw.shape, [
          "pythagoras",
          "inscribed_polygon",
          "triangle_angles",
          "venn",
        ] as const),
        sides: finiteNumber(raw.sides, 5, 32),
      });
    case "transformation": {
      const matrix = raw.matrix;
      const valid =
        Array.isArray(matrix) &&
        matrix.length === 2 &&
        matrix.every(
          (row) =>
            Array.isArray(row) &&
            row.length === 2 &&
            row.every((entry) => finiteNumber(entry, -3, 3) !== undefined),
        );
      return withoutUndefined({
        type,
        matrix: valid
          ? (matrix as [[number, number], [number, number]])
          : undefined,
      });
    }
    case "vector_field":
      return withoutUndefined({
        type,
        field: pick(raw.field, [
          "rotation",
          "source",
          "saddle",
          "spiral",
        ] as const),
      });
    case "orbit":
      return withoutUndefined({
        type,
        eccentricity: finiteNumber(raw.eccentricity, 0.1, 0.85),
      });
    case "network": {
      const layers = raw.layers;
      const valid =
        Array.isArray(layers) &&
        layers.length >= 2 &&
        layers.length <= 5 &&
        layers.every(
          (size) => Number.isInteger(size) && size >= 1 && size <= 7,
        );
      return withoutUndefined({
        type,
        layers: valid ? (layers as number[]) : undefined,
      });
    }
    case "surface_3d":
      return withoutUndefined({
        type,
        expression:
          sanitizeThumbnailSurfaceExpression(raw.expression) || undefined,
      });
    case "solid_3d":
      return withoutUndefined({
        type,
        shape: pick(raw.shape, ["sphere", "torus", "cube"] as const),
      });
    case "equation":
      return withoutUndefined({ type, notation });
    default:
      return { type };
  }
}

const HEADLINE_LIMIT = 34;
const EYEBROW_LIMIT = 24;

/** Validate headline copy; invalid copy becomes empty (a visual-only thumbnail). */
export function sanitizeThumbnailHeadline(value: unknown): string {
  if (typeof value !== "string") return "";
  const headline = value.replace(/\s+/g, " ").trim();
  if (!headline || headline.split("$").length % 2 === 0) return "";
  const words = headline.split(" ");
  if (words.length > 7 || thumbnailCopyLength(headline) > HEADLINE_LIMIT)
    return "";
  const mathSegments = headline.split("$").filter((_, index) => index % 2);
  if (mathSegments.some((segment) => !sanitizeThumbnailLatex(segment)))
    return "";
  if (
    /[\\{}#%&_^]/.test(
      headline
        .split("$")
        .filter((_, i) => i % 2 === 0)
        .join(""),
    )
  ) {
    return "";
  }
  return headline;
}

function sanitizeEyebrow(value: unknown): string {
  if (typeof value !== "string") return "";
  const eyebrow = value.replace(/\s+/g, " ").trim();
  return eyebrow.length <= EYEBROW_LIMIT &&
    /^[\p{L}\p{N} '’&\-]+$/u.test(eyebrow)
    ? eyebrow
    : "";
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
      const rawVisual =
        record.visual && typeof record.visual === "object"
          ? (record.visual as Record<string, unknown>)
          : {};
      const visualType = pick(
        rawVisual.type ?? record.visualType,
        THUMBNAIL_VISUAL_TYPES,
      );
      const headline = sanitizeThumbnailHeadline(
        record.headline ?? record.thumbnailText,
      );
      const accent =
        typeof record.accent === "string" &&
        record.accent.trim() &&
        headline.includes(record.accent.trim())
          ? record.accent.trim()
          : "";
      return {
        title: cleanTitle(record.title),
        concept: visualType
          ? {
              eyebrow: sanitizeEyebrow(record.eyebrow),
              headline,
              accent,
              visualConcept:
                typeof record.visualConcept === "string"
                  ? record.visualConcept
                      .replace(/\s+/g, " ")
                      .trim()
                      .slice(0, 160)
                  : "",
              visual: sanitizeThumbnailVisual(visualType, {
                // Older title packages used flat fields; keep them working.
                notation: record.mathNotation,
                expression: record.plotExpression,
                xRange: record.plotXRange,
                ...rawVisual,
              }),
            }
          : undefined,
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
  const concepts = parsed.map(({ concept }, index) =>
    concept && index === VISUAL_ONLY_THUMBNAIL_INDEX
      ? { ...concept, headline: "", accent: "" }
      : concept,
  );
  const hasCompleteConcepts = concepts.every(
    (concept): concept is ThumbnailConcept => concept !== undefined,
  );

  return {
    selected: candidates[0],
    candidates,
    ...(hasCompleteConcepts
      ? {
          thumbnailConcepts: concepts as [
            ThumbnailConcept,
            ThumbnailConcept,
            ThumbnailConcept,
          ],
        }
      : {}),
  };
}

/**
 * Prefer the strongest title's thumbnail. If it failed to render, publish the
 * next-ranked title together with its own thumbnail so the pair stays matched.
 */
export function selectThumbnailPair(
  titles: VideoTitleSet,
  pairs: ThumbnailPair[] | undefined,
): ThumbnailPair | undefined {
  if (!pairs?.length) return undefined;
  for (const title of [titles.selected, ...titles.candidates]) {
    const pair = pairs.find((candidate) => candidate.title === title);
    if (pair) return pair;
  }
  return undefined;
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

export const DESCRIPTION_CTA =
  "Made with https://eduvids.app (free) · Star it: https://github.com/namanbnsl/eduvids";

/**
 * Brings an already-published description up to the current call to action.
 * Replaces the first older eduvids.app line, or adds the line before the
 * trailing hashtags. Returns null when the description is already current.
 */
export function withDescriptionCta(description: string): string | null {
  if (description.includes(DESCRIPTION_CTA)) return null;
  if (!description.trim()) return DESCRIPTION_CTA;

  const lines = description.split("\n");
  const oldCta = lines.findIndex(
    (line) => /eduvids\.app/i.test(line) && !/github\.com/i.test(line),
  );
  if (oldCta !== -1) {
    lines[oldCta] = DESCRIPTION_CTA;
    return lines.join("\n");
  }

  const blocks = description.trimEnd().split(/\n{2,}/);
  const last = blocks.at(-1) ?? "";
  const endsWithHashtags = /^(#[\p{L}\p{N}_]+\s*)+$/u.test(last.trim());
  if (endsWithHashtags && blocks.length > 1) {
    blocks.splice(blocks.length - 1, 0, DESCRIPTION_CTA);
  } else {
    blocks.push(DESCRIPTION_CTA);
  }
  return blocks.join("\n\n");
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

  blocks.push(DESCRIPTION_CTA);
  if (hashtags.length) blocks.push(hashtags.slice(0, 3).join(" "));
  return blocks.join("\n\n");
}

export function buildPreviousVideoComment(
  previousVideo: RelatedYouTubeVideo,
): string {
  return `Previous: ${previousVideo.title} → ${previousVideo.watchUrl}`;
}
