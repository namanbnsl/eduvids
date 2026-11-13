import type { YouTubeChapter } from "./youtube-metadata";
import { safeError } from "./workflow/errors";

export const GENERIC_VIDEO_TITLE = "A Visual Math and Science Exploration";
const DANGLING_WORD =
  /\b(?:a|an|the|and|or|but|nor|so|yet|at|of|with|without|to|from|in|on|for|by|into|onto|through|between|because|although|while|if|than|that|which|whose|as)\s*[.!?]?$/i;

// A request pasted in as a title: "A vertical short video explaining ...".
const RAW_PROMPT =
  /\b(?:video|animation|short)\s+(?:explaining|about|showing|covering|that\s+(?:explains|shows))\b|^(?:an?\s+)?(?:vertical|horizontal|short|animated|quick|landscape|portrait)\s+(?:\w+\s+)?(?:video|animation|explainer)\b|^(?:please\s+)?(?:make|create|generate|explain)\b/i;

/** New titles must fit on a phone and lead with the concept people search for. */
export const NEW_TITLE_LIMIT = 70;
const GENERIC_TOPIC =
  /^(?:math(?:s|ematics)?|science|physics|chemistry|biology|engineering|fun\s+facts?|did\s+you\s+know|the\s+answer|this|it)$/i;
const GENERIC_OPENING =
  /^(?:understanding|introduction(?:\s+to)?|intro\s+to|exploring|all\s+about|an?\s+(?:overview|look|guide)|the\s+(?:basics|science|math|story)\s+of|learn(?:ing)?)\b/i;
const GENERIC_PHRASES =
  /\b(?:explained|basics|lesson|tutorial|ultimate|mind[-\s]?blowing|insane|you\s+won'?t\s+believe|finally\s+makes\s+sense|visuali[sz]ed|simple\s+guide|everything\s+you\s+need)\b/i;

/**
 * Packaging rules for a title about to be published: "Topic: hook". Titles
 * that name the topic first earn about twice the channel's average CTR, while
 * question-first and vague titles trail it. Older channel titles predate this,
 * so related-video checks use titleValidationErrors alone.
 */
export function newTitleErrors(title: string): string[] {
  const errors: string[] = [];
  const text = title.trim();
  if (text.length > NEW_TITLE_LIMIT)
    errors.push(
      `title exceeds ${NEW_TITLE_LIMIT} characters; rewrite it shorter, never truncate`,
    );
  if (GENERIC_PHRASES.test(text) || GENERIC_OPENING.test(text))
    errors.push("title is generic; name the specific idea and its surprise");
  const match = text.match(/^([^:：]+)[:：]\s*(.+)$/u);
  const topic = match?.[1]?.trim() ?? "";
  const hook = match?.[2]?.trim() ?? "";
  const topicWords = topic.split(/\s+/).filter(Boolean).length;
  if (
    !match ||
    topicWords < 1 ||
    topicWords > 5 ||
    hook.split(/\s+/).filter(Boolean).length < 2
  ) {
    errors.push(
      'title must lead with the searchable topic in 1-5 words, then a colon and the hook, e.g. "Chaos Theory: Why Tiny Causes Destroy Predictability"',
    );
  } else if (
    /^(?:why|how|what|when|where|which|who|can|does|do|is|are)\b/i.test(
      topic,
    ) ||
    GENERIC_TOPIC.test(topic)
  ) {
    errors.push(
      "title must open with the concept's name, not a question word or a vague subject",
    );
  }
  return errors;
}

export function normalizeYouTubeTitle(title: string): string {
  return title.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

/** Check the original value: never hide bad output by trimming it to fit. */
export function titleValidationErrors(
  title: string,
  existingTitles: Iterable<string> = [],
): string[] {
  const errors: string[] = [];
  const text = title.trim();
  if (!text) errors.push("missing title");
  if (text.length > 100)
    errors.push("title exceeds 100 characters; regenerate, never truncate");
  if (
    /^(?:title(?:\s+(?:slide|screen|on\s+screen))?|titled|scene)\b/i.test(text)
  )
    errors.push("title starts with a production label");
  if (/^["'“”‘’]|["'“”‘’]$/.test(text))
    errors.push("title has wrapping quotes");
  if (/[()]/.test(text)) errors.push("title contains parentheses");
  if (
    /\b(?:variant|scenes?|seconds)\b|[~≈]\s*\d|\b\d+(?:\.\d+)?\s*(?:secs?|mins?|minutes?)\b/i.test(
      text,
    )
  )
    errors.push("title contains scene or duration instructions");
  if (
    /^(?:animation|video|detailed|educational|a\s+video\s+that)\b/i.test(text)
  )
    errors.push("title starts with a production brief");
  if (DANGLING_WORD.test(text) || /(?:\.{3}|…|[,;:\-–—])$/.test(text))
    errors.push("title ends in an incomplete phrase");
  if (/[<>\r\n]/.test(text))
    errors.push("title contains markup or line breaks");
  if (/[$\\]|\*\*|`/.test(text))
    errors.push("title contains LaTeX or Markdown; write the words instead");
  if (/&(?:[a-z]+|#\d+|#x[\da-f]+);/i.test(text))
    errors.push("title contains an HTML entity");
  if (/#\p{L}/u.test(text)) errors.push("title contains a hashtag");
  if (RAW_PROMPT.test(text))
    errors.push("title is the raw request, not a viewer-facing title");
  if (/\b(?:eduvids|namanbnsl|github)\b/i.test(text))
    errors.push("title contains the channel or repository name");
  const normalized = normalizeYouTubeTitle(text);
  if (normalized === normalizeYouTubeTitle(GENERIC_VIDEO_TITLE))
    errors.push("generic fallback title");
  if (
    Array.from(existingTitles).some(
      (other) => normalizeYouTubeTitle(other) === normalized,
    )
  )
    errors.push("title already exists on the channel");
  return errors;
}

export function assertValidUploadTitle(
  title: string,
  existingTitles: Iterable<string> = [],
): string {
  const errors = [
    ...titleValidationErrors(title, existingTitles),
    ...newTitleErrors(title),
  ];
  if (errors.length)
    throw new Error(
      `${errors.join("; ")}. Rejected title: ${JSON.stringify(title)}`,
    );
  return title.trim();
}

export function isCompleteDescriptionLine(line: string): boolean {
  // Reject a clipped clause, even when jsonrepair can close its surrounding JSON.
  const firstCharacter = line.match(/[\p{L}\p{N}]/u)?.[0];
  return (
    !!line.trim() &&
    !!firstCharacter &&
    !/\p{Ll}/u.test(firstCharacter) &&
    /[.!?。！？]["'”’]?$/u.test(line.trim()) &&
    !DANGLING_WORD.test(line.replace(/[.!?。！？"'”’]+$/, ""))
  );
}

// Isolated configuration: no per-job language setting can leak to another job.
// ELD handles short headings better than the narration detector (franc).
async function loadLanguageDetector() {
  const { eld } = await import("eld/medium");
  return eld.newInstance();
}
let detectorPromise: ReturnType<typeof loadLanguageDetector> | undefined;
const languageDetector = () => (detectorPromise ??= loadLanguageDetector());
function languageText(text: string): string {
  return text
    .replace(/\b(?:pH|sp[23]|[A-Z]+\d+[A-Za-z0-9]*|[A-Z]{2,5})\b/g, " ")
    .replace(
      /\b\p{Lu}[\p{L}-]+['’]s\s+(?:law|theorem|principle|constant|equation)\b/gu,
      " ",
    )
    .replace(/[^\p{L}\s'’]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function detectMetadataLanguage(
  text: string,
): Promise<string | undefined> {
  const sample = languageText(text);
  if (sample.replace(/\s/g, "").length < 4) return undefined;
  const result = (await languageDetector()).detect(sample);
  return result.isReliable() ? result.language || undefined : undefined;
}

export async function chapterLanguageErrors(
  title: string,
  chapters: YouTubeChapter[],
): Promise<string[]> {
  if (!chapters.length) return [];
  const language = await detectMetadataLanguage(title);
  if (!language) return ["cannot detect the title language"];
  const errors: string[] = [];
  const detector = await languageDetector();
  chapters.forEach((chapter, index) => {
    const text = languageText(chapter.title);
    if (
      !chapter.title.trim() ||
      chapter.title.length > 60 ||
      /[\r\n]/.test(chapter.title)
    ) {
      errors.push(
        `chapter ${index + 1} has an empty, overlong or multiline name`,
      );
      return;
    }
    if (!text) return; // Only technical tokens remain.
    if (language === "en" && /[^\p{Script=Latin}\s'’]/u.test(text)) {
      errors.push(
        `chapter ${index + 1} uses a non-Latin script in an English video`,
      );
      return;
    }
    if (text.replace(/\s/g, "").length < 4) return;
    const result = detector.detect(text);
    if (!result.isReliable()) {
      errors.push(
        `chapter ${index + 1} language cannot be identified confidently`,
      );
      return;
    }
    const detected = result.language;
    const scores = result.getScores();
    // Eponyms/cognates can put related languages almost level (for example
    // Spanish "Corrientes de Foucault"). Use the title to resolve that tie.
    const matchesTitle =
      (scores[language] ?? 0) >= (scores[detected] ?? 1) - 0.025;
    if (detected !== language && !matchesTitle) {
      errors.push(
        `chapter ${index + 1} language ${detected} differs from title language ${language}`,
      );
    }
  });
  return errors;
}

export class YouTubeMetadataReviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "YouTubeMetadataReviewError";
  }
}

/** Three new generations at most, with one deadline for the entire repair. */
export async function repairYouTubeMetadata<T>(
  initial: T,
  validate: (value: T) => T | Promise<T>,
  generate: (feedback: string, signal: AbortSignal) => Promise<T>,
): Promise<T> {
  let feedback: string;
  try {
    return await validate(initial);
  } catch (error) {
    feedback = error instanceof Error ? error.message : "invalid metadata";
  }
  const signal = AbortSignal.timeout(180_000);
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      signal.throwIfAborted();
      const value = await generate(feedback, signal);
      signal.throwIfAborted();
      const validated = await validate(value);
      signal.throwIfAborted();
      return validated;
    } catch (error) {
      feedback = safeError(error);
      console.warn(
        `[YouTube metadata] Repair ${attempt}/3 rejected: ${feedback}`,
      );
      if (signal.aborted) break;
    }
  }
  throw new YouTubeMetadataReviewError(
    `YouTube metadata needs review: ${feedback}`,
  );
}
