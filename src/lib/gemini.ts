import {
  MANIM_SYSTEM_PROMPT,
  VOICEOVER_SYSTEM_PROMPT,
  VOICEOVER_SERVICE_CLASS,
  VOICEOVER_SERVICE_SETTER,
} from "@/prompt";
import { generateText } from "ai";
import fs from "fs";
import path from "path";
import type { RenderLogEntry, ValidationStage } from "./e2b";
import { createGoogleProvider } from "./google-provider";

const google = (modelId: string) => createGoogleProvider()(modelId);

interface ManimReferenceDocs {
  markdown: string;
  json: unknown;
}

let cachedManimDocs: ManimReferenceDocs | null = null;

function loadManimReferenceDocs(): ManimReferenceDocs {
  if (cachedManimDocs) {
    return cachedManimDocs;
  }

  const docsDir = path.join(process.cwd(), "docs");
  let markdown = "";
  let json: unknown = {};

  try {
    markdown = fs.readFileSync(
      path.join(docsDir, "MANIM_SHORT_REF.md"),
      "utf8"
    );
  } catch {
    markdown = "";
  }

  try {
    const raw = fs.readFileSync(
      path.join(docsDir, "MANIM_SHORT_REF.json"),
      "utf8"
    );
    json = JSON.parse(raw) as unknown;
  } catch {
    json = {};
  }

  cachedManimDocs = { markdown, json };
  return cachedManimDocs;
}

function buildAugmentedSystemPrompt(base: string): string {
  const { markdown, json } = loadManimReferenceDocs();
  return `${base}\n\n---\nMANIM_SHORT_REF.md (local):\n${markdown}\n\nMANIM_SHORT_REF.json (local):\n${JSON.stringify(
    json
  )}\n---`;
}

const truncate = (value: string, max = 2000) => {
  if (!value) return "";
  return value.length > max
    ? `${value.slice(0, max)}\n...[truncated ${value.length - max} chars]`
    : value;
};

export interface VoiceoverScriptRequest {
  prompt: string;
}

export interface ManimScriptRequest {
  prompt: string;
  voiceoverScript: string;
}

export interface ManimScript {
  code: string;
}

export interface PlannedManimSegment {
  id: string;
  title: string;
  narration: string;
  cues?: string[];
}

export interface PlanManimSegmentsRequest {
  prompt: string;
  voiceoverScript: string;
}

export interface ManimSegmentScriptRequest extends ManimScriptRequest {
  segment: PlannedManimSegment;
}

export interface ManimGenerationErrorDetails {
  message?: string;
  stack?: string;
  stderr?: string;
  stdout?: string;
  exitCode?: number;
  stage?: ValidationStage;
  hint?: string;
  logs?: RenderLogEntry[];
}

export interface ManimGenerationAttempt {
  attemptNumber: number;
  script: string;
  error: ManimGenerationErrorDetails;
}

export interface VerifyManimScriptRequest {
  prompt: string;
  voiceoverScript: string;
  script: string;
}

export interface VerifyManimScriptResult {
  ok: boolean;
  error?: string;
  fixedScript?: string;
}

export async function generateVoiceoverScript({
  prompt,
}: VoiceoverScriptRequest): Promise<string> {
  const model = google("gemini-2.5-flash");

  const systemPrompt = VOICEOVER_SYSTEM_PROMPT;

  const { text } = await generateText({
    model,
    system: systemPrompt,
    prompt: `User request: ${prompt}\n\nDraft the narration segments:`,
  });

  return text.trim();
}

export async function generateManimScript({
  prompt,
  voiceoverScript,
}: ManimScriptRequest): Promise<string> {
  const model = google("gemini-2.5-pro");
  const augmentedSystemPrompt = buildAugmentedSystemPrompt(MANIM_SYSTEM_PROMPT);

  const firstAttempt = await generateText({
    model,
    system: augmentedSystemPrompt,
    prompt: `User request: ${prompt}\n\nVoiceover narration:\n${voiceoverScript}\n\nGenerate the complete Manim script that follows the narration:`,
    temperature: 0.1,
  });

  // Extract code from potential markdown formatting
  const code = firstAttempt.text
    .replace(/```python?\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  return code;
}

export async function planManimSegments({
  prompt,
  voiceoverScript,
}: PlanManimSegmentsRequest): Promise<PlannedManimSegment[]> {
  const model = google("gemini-2.5-pro");
  const systemPrompt = [
    "You are an experienced video editor who divides narration scripts into clean Manim segments.",
    "Identify natural cut points at pauses or topic shifts so voiceovers stay coherent when concatenated.",
    "Return JSON describing 4-7 ordered segments covering the entire narration with no gaps or overlaps.",
    "Keep each segment crisp: aim for roughly 1-3 short sentences or <= 45 words per segment.",
    "Each segment must include an id (slug), short title, narration text, and optional cues array.",
    "Respond with JSON only.",
  ].join(" ");

  const { text } = await generateText({
    model,
    system: systemPrompt,
    prompt: [
      `Video prompt: ${prompt}`,
      "Full narration (voiceover):",
      voiceoverScript,
      "Plan the segment timeline.",
      "JSON schema: { segments: [{ id: string, title: string, narration: string, cues?: string[] }] }",
    ].join("\n\n"),
    temperature: 0,
  });

  const raw = text.trim();
  const extractJsonString = (input: string): string | null => {
    const fenced = input.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced?.[1]) return fenced[1].trim();
    const firstBrace = input.indexOf("{");
    const lastBrace = input.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return input.slice(firstBrace, lastBrace + 1).trim();
    }
    return null;
  };

  const jsonCandidate = extractJsonString(raw) ?? raw;
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonCandidate);
  } catch (error) {
    throw new Error(
      `Failed to parse segment planning response as JSON: ${
        (error as Error).message
      }. Raw response: ${raw}`
    );
  }

  const segments =
    (parsed && typeof parsed === "object" && "segments" in parsed
      ? (parsed as { segments?: PlannedManimSegment[] }).segments
      : Array.isArray(parsed)
      ? (parsed as PlannedManimSegment[])
      : undefined) ?? [];

  const normalized = segments
    .map((segment, index) => {
      const id = segment?.id?.trim() || `segment-${index + 1}`;
      const title = segment?.title?.trim() || `Segment ${index + 1}`;
      const narration = segment?.narration?.trim() ?? "";
      const cues = Array.isArray(segment?.cues)
        ? segment.cues.filter(
            (cue): cue is string =>
              typeof cue === "string" && cue.trim().length > 0
          )
        : undefined;
      return {
        id,
        title,
        narration,
        cues,
      } satisfies PlannedManimSegment;
    })
    .filter((segment) => segment.narration.length > 0);

  const refined = splitSegmentsIntoShortChunks(normalized);

  if (!refined.length) {
    throw new Error(
      `Segment planner returned no usable segments. Parsed value: ${JSON.stringify(
        parsed
      ).slice(0, 4000)}`
    );
  }

  return refined;
}

export async function generateSegmentManimScript({
  prompt,
  voiceoverScript,
  segment,
}: ManimSegmentScriptRequest): Promise<string> {
  const model = google("gemini-2.5-pro");
  const augmentedSystemPrompt = buildAugmentedSystemPrompt(MANIM_SYSTEM_PROMPT);
  const { id, title, narration } = segment;

  const { text } = await generateText({
    model,
    system: augmentedSystemPrompt,
    prompt: [
      `Video prompt: ${prompt}`,
      `Segment id: ${id}`,
      `Segment title: ${title}`,
      "Full narration for the whole video:",
      voiceoverScript,
      "Narration allocated for this segment:",
      narration,
      "Generate only the Python Manim code for this segment, matching the narration timing.",
      "The script must be a self-contained Manim scene named MyScene using manim_voiceover.",
      "Ensure the scene covers only this segment's narration and assumes preceding content has already played.",
      "Keep the visuals tight: reuse existing mobjects when possible and remove anything no longer needed immediately.",
      "Avoid complex camera motion, trackers, path animations, or updaters.",
      "Limit each segment to a small number of quick animations so the pacing remains crisp.",
      "Do not include markdown fences or commentary.",
    ].join("\n\n"),
    temperature: 0.1,
  });

  const code = text
    .replace(/```python?\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  if (!code.length) {
    throw new Error(`Generated empty script for segment ${segment.id}`);
  }

  return code;
}

const MAX_WORDS_PER_SEGMENT = 45;
const MIN_WORDS_PER_SEGMENT = 8;

const splitSegmentsIntoShortChunks = (
  segments: PlannedManimSegment[]
): PlannedManimSegment[] => {
  const seenIds = new Set<string>();

  const ensureUniqueId = (baseId: string): string => {
    let candidate = baseId;
    let counter = 2;
    while (seenIds.has(candidate)) {
      candidate = `${baseId}-${counter}`;
      counter += 1;
    }
    seenIds.add(candidate);
    return candidate;
  };

  const chunkTokenizedNarration = (input: string): string[] => {
    const tokens = input
      .split(/\s+/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);

    if (!tokens.length) {
      return [];
    }

    const chunks: string[] = [];
    let current: string[] = [];

    const flushCurrent = () => {
      if (!current.length) {
        return;
      }
      const text = current.join(" ").trim();
      current = [];
      if (text.length) {
        chunks.push(text);
      }
    };

    for (const token of tokens) {
      current.push(token);
      const wordCount = current.length;
      const sentenceEnds = /[.!?]["')]*$/.test(token);
      const exceedsMax = wordCount >= MAX_WORDS_PER_SEGMENT;
      const goodSentenceBreak =
        wordCount >= MIN_WORDS_PER_SEGMENT && sentenceEnds;

      if (exceedsMax || goodSentenceBreak) {
        flushCurrent();
      }
    }

    if (current.length) {
      const trailing = current.join(" ").trim();
      if (
        chunks.length &&
        trailing.split(/\s+/).length < MIN_WORDS_PER_SEGMENT
      ) {
        const last = chunks.pop() ?? "";
        const merged = `${last} ${trailing}`.trim();
        if (merged.length) {
          chunks.push(merged);
        }
      } else if (trailing.length) {
        chunks.push(trailing);
      }
    }

    return chunks;
  };

  const buildTitle = (
    baseTitle: string,
    fallbackIndex: number,
    partIndex: number,
    totalParts: number,
    narration: string
  ): string => {
    const trimmedTitle = baseTitle.trim();
    const base = trimmedTitle.length
      ? trimmedTitle
      : `Segment ${fallbackIndex + 1}`;
    if (totalParts <= 1) {
      return base;
    }

    const shortNarration = narration.split(/\s+/).slice(0, 6).join(" ");

    const annotated = `${base} (Part ${partIndex + 1})`;
    if (annotated.length <= 60) {
      return annotated;
    }
    const fallback = `${shortNarration}`.trim();
    return fallback.length ? `${fallback} (Part ${partIndex + 1})` : annotated;
  };

  return segments.flatMap((segment, segmentIndex) => {
    const narration = segment.narration.trim();
    if (!narration) {
      return [] as PlannedManimSegment[];
    }

    const chunks = chunkTokenizedNarration(narration);
    if (!chunks.length) {
      return [
        {
          id: ensureUniqueId(segment.id),
          title: segment.title,
          narration,
          cues: segment.cues,
        },
      ];
    }

    const totalParts = chunks.length;

    return chunks.map((chunk, chunkIndex) => {
      const baseId =
        totalParts > 1
          ? `${segment.id}-p${String(chunkIndex + 1).padStart(2, "0")}`
          : segment.id;
      const id = ensureUniqueId(baseId);
      const title = buildTitle(
        segment.title,
        segmentIndex,
        chunkIndex,
        totalParts,
        chunk
      );
      return {
        id,
        title,
        narration: chunk,
        cues: segment.cues,
      } satisfies PlannedManimSegment;
    });
  });
};

export async function generateYoutubeTitle({
  prompt,
  voiceoverScript,
}: ManimScriptRequest) {
  const model = google("gemini-2.5-flash");

  const systemPrompt =
    "You are a copywriter crafting clear, informative YouTube titles for educational videos. Keep it under 80 characters, avoid clickbait phrasing, and respond with only the final title—no quotes or extra text.";
  const { text } = await generateText({
    model,
    system: systemPrompt,
    prompt: `User request: ${prompt}\n\nVoiceover narration:\n${voiceoverScript}\n\nWrite an informative YouTube title that clearly states the main topic or insight of the video, highlights the primary takeaway, avoids sensational language, and stays under 80 characters:`,
    temperature: 0.5,
  });

  return text.trim();
}

export async function generateYoutubeDescription({
  prompt,
  voiceoverScript,
}: ManimScriptRequest) {
  const model = google("gemini-2.5-flash");

  const systemPrompt =
    "You are a content strategist who writes concise, informative YouTube descriptions for educational videos. Summaries should explain what the video covers, avoid emojis, hashtags, and marketing language, and respond only with plain text.";
  const { text } = await generateText({
    model,
    system: systemPrompt,
    prompt: `User request: ${prompt}\n\nVoiceover narration:\n${voiceoverScript}\n\nWrite a YouTube description that briefly introduces the topic, outlines the main concepts viewers will learn, references any notable examples or tools, stays concise, and does not copy the voiceover script verbatim:`,
    temperature: 0.5,
  });

  return text.trim();
}

export interface ThumbnailScriptRequest {
  prompt: string;
  title: string;
  voiceoverScript: string;
}

export async function generateThumbnailManimScript({
  prompt,
  title,
  voiceoverScript,
}: ThumbnailScriptRequest): Promise<string> {
  const model = google("gemini-2.5-pro");
  const augmentedSystemPrompt = buildAugmentedSystemPrompt(
    "You are a Manim Community v0.18.0 expert creating eye-catching YouTube thumbnail frames. Generate a single static frame that captures the video's essence. The scene should be visually striking, clear, and professional. Use bold text, vibrant colors, and simple shapes. DO NOT use voiceover or animations. The construct method should create all objects and add them to the scene without any animations. Use self.add() instead of self.play() for all objects."
  );

  const { text } = await generateText({
    model,
    system: augmentedSystemPrompt,
    prompt: [
      `Video prompt: ${prompt}`,
      `Video title: ${title}`,
      `Voiceover narration (for context):\n${voiceoverScript}`,
      "",
      "Generate a Manim script for a YouTube thumbnail that:",
      "1. MUST declare: from manim import *",
      "2. MUST declare: class MyScene(Scene):",
      "3. MUST declare: def construct(self):",
      "4. Creates a single static frame (no animations)",
      "5. Features the video title prominently in the upper third with large, bold text",
      "6. Adds a headline phrase (6-8 words) on a high-contrast rounded rectangle banner that states the main action or promise of the video",
      "7. Adds a supporting subtext line (8-12 words) beneath the headline describing what viewers will learn or see",
      "8. Uses WHITE for main text, YELLOW for emphasized words, and DARK_BLUE for the headline banner background",
      "9. Applies subtle drop shadows and stroke outlines so all text remains readable",
      "10. Includes 1-2 key visual elements that represent the video topic (icons, diagrams, or symbolic shapes)",
      "11. Uses a dynamic background (gradient or geometric pattern) that contrasts with the text",
      "12. Ensures the layout has clear visual hierarchy and balanced spacing",
      "13. Uses self.add() to add all objects (NO self.play() calls)",
      "14. Keeps text readable and ensures no elements run past safe margins",
      "15. Uses simple shapes and consistent alignment for a polished look",
      "",
      "REQUIRED structure (do not omit these lines):",
      "```python",
      "from manim import *",
      "",
      "class MyScene(Scene):",
      "    def construct(self):",
      "        # Your code here using self.add()",
      "```",
      "",
      "Use Rectangles with rounded corners for banners/backgrounds and add glow effects via apply_depth_test=False and stroke settings when needed.",
      "Arrange elements so the title sits near the top, the headline overlay sits center-left, and the subtext sits below the headline with consistent alignment.",
      "Example:",
      "```python",
      "from manim import *",
      "",
      "class MyScene(Scene):",
      "    def construct(self):",
      "        title = Text('Video Title', font_size=72, color=WHITE)",
      "        title.to_edge(UP, buff=1.0)",
      "        visual = Circle(radius=2, color=YELLOW)",
      "        visual.move_to(ORIGIN)",
      "        self.add(title, visual)",
      "```",
      "",
      "Return ONLY the complete Python code with no commentary or markdown fences. Ensure class MyScene and def construct are included:",
    ].join("\n"),
    temperature: 0.1,
  });

  const code = text
    .replace(/```python?\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  return code;
}

export interface RegenerateManimScriptRequest {
  prompt: string;
  voiceoverScript: string;
  previousScript: string;
  error: string; // human-readable message
  errorDetails?: ManimGenerationErrorDetails;
  attemptNumber: number;
  attemptHistory?: ManimGenerationAttempt[];
  blockedScripts?: string[];
  forceRewrite?: boolean;
  forcedReason?: string;
  repeatedErrorCount?: number;
}

export async function regenerateManimScriptWithError({
  prompt,
  voiceoverScript,
  previousScript,
  error,
  errorDetails,
  attemptNumber,
  attemptHistory = [],
  blockedScripts = [],
  forceRewrite = false,
  forcedReason,
  repeatedErrorCount = 0,
}: RegenerateManimScriptRequest): Promise<string> {
  const model = google("gemini-2.5-pro");
  const augmentedSystemPrompt = buildAugmentedSystemPrompt(MANIM_SYSTEM_PROMPT);

  const previousAttemptsSummary = (() => {
    if (!attemptHistory.length) return "";
    const blocks = attemptHistory.map((attempt) => {
      const lines: string[] = [`Attempt #${attempt.attemptNumber}`];
      if (attempt.error.message) {
        lines.push(`- Message: ${attempt.error.message}`);
      }
      if (typeof attempt.error.exitCode === "number") {
        lines.push(`- Exit code: ${attempt.error.exitCode}`);
      }
      if (attempt.error.stderr) {
        lines.push(`- STDERR snippet:\n${truncate(attempt.error.stderr)}`);
      }
      if (attempt.error.stdout) {
        lines.push(`- STDOUT snippet:\n${truncate(attempt.error.stdout)}`);
      }
      if (attempt.error.stack) {
        lines.push(`- Stack snippet:\n${truncate(attempt.error.stack)}`);
      }
      return lines.join("\n");
    });
    return `\nSummary of previous failed attempts:\n${blocks.join("\n\n")}`;
  })();

  const structuredErrorSection = (() => {
    if (!errorDetails) return "";
    const parts: string[] = [];
    if (typeof errorDetails.exitCode === "number") {
      parts.push(`Exit code: ${errorDetails.exitCode}`);
    }
    if (errorDetails.stderr && errorDetails.stderr.trim().length > 0) {
      parts.push(
        `STDERR (truncated to 2k chars):\n${errorDetails.stderr.slice(0, 2000)}`
      );
    }
    if (errorDetails.stdout && errorDetails.stdout.trim().length > 0) {
      parts.push(
        `STDOUT (truncated to 2k chars):\n${errorDetails.stdout.slice(0, 2000)}`
      );
    }
    if (errorDetails.stack && errorDetails.stack.trim().length > 0) {
      parts.push(
        `Stack (truncated to 2k chars):\n${errorDetails.stack.slice(0, 2000)}`
      );
    }
    if (errorDetails.message && errorDetails.message.trim().length > 0) {
      parts.push(`Error message: ${errorDetails.message}`);
    }
    return parts.length
      ? `\nAdditional structured error details:\n${parts.join("\n\n")}\n`
      : "";
  })();

  const normalizedError = error?.trim().length
    ? error
    : errorDetails?.message ?? "Unknown error";

  const blockedScriptsSection = (() => {
    if (!blockedScripts.length) return "";
    const unique = Array.from(
      new Map(
        blockedScripts.map((script) => {
          const trimmed = script.trim();
          return [trimmed, truncate(trimmed, 6000)];
        })
      ).values()
    );
    if (!unique.length) return "";
    const blocks = unique
      .map(
        (script, idx) => `--- Failed Script Variant #${idx + 1} ---\n${script}`
      )
      .join("\n\n");
    return `\nThe following script variants are known to fail. You must not reuse them verbatim or with superficial edits. Study them to understand and avoid the mistakes:\n${blocks}\n`;
  })();

  const rewriteDirective = forceRewrite
    ? `\nThis is a forced rewrite because the last regeneration did not resolve the issue. ${
        forcedReason ??
        "Produce a substantially different script that fixes the problem."
      }`
    : "";

  const repetitionDirective =
    repeatedErrorCount > 1
      ? `\nThe same error (or a very similar one) has occurred ${repeatedErrorCount} times. You must eliminate the root cause immediately.`
      : "";

  const promptSections = [
    `User request: ${prompt}`,
    `Voiceover narration:\n${voiceoverScript}`,
    previousAttemptsSummary.trim(),
    `⚠️ PREVIOUS ATTEMPT #${attemptNumber} FAILED ⚠️`,
    `The previous Manim script failed with the following error:\n\`\`\`\n${normalizedError}\n\`\`\`${structuredErrorSection}`,
    `The broken script was:\n\`\`\`python\n${previousScript}\n\`\`\`${blockedScriptsSection}${rewriteDirective}${repetitionDirective}`,
    "You must analyze the failure, apply all necessary fixes, and generate a corrected Manim script that:\n1. Resolves the specific error\n2. Follows the narration timeline\n3. Uses proper Manim syntax and best practices\n4. Avoids repeating any previous mistakes or failing scripts\n5. Differs meaningfully from the broken script when required\n\nReturn ONLY the fully corrected Python code with no commentary, no analysis, and no Markdown fences. Provide just the executable script:",
  ].filter((section) => section && section.trim().length > 0);

  const { text } = await generateText({
    model,
    system: augmentedSystemPrompt,
    prompt: promptSections.join("\n\n"),
    temperature: 0.1,
  });

  // Extract code from potential markdown formatting
  const code = text
    .replace(/```python?\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  return code;
}

// Uses Gemini 2.5 Pro with local docs to statically validate the Manim script
// and optionally provide a corrected version when issues are detected.
export async function verifyManimScript({
  prompt,
  voiceoverScript,
  script,
}: VerifyManimScriptRequest): Promise<VerifyManimScriptResult> {
  const model = google("gemini-2.5-pro");
  const verifierSystemPrompt = buildAugmentedSystemPrompt(
    [
      "You are a meticulous static verifier for Manim Community v0.18.0 scripts using manim_voiceover.",
      "Use the attached documentation to confirm API usage, but focus on issues that would break rendering or clearly violate critical constraints.",
      "Approve scripts unchanged when they are safe, even if minor stylistic improvements are possible.",
      "",
      "Treat the following as blocking issues that must be fixed:",
      `1. Missing required imports (VoiceoverScene, ${VOICEOVER_SERVICE_CLASS}, etc.) or missing ${VOICEOVER_SERVICE_SETTER}.`,
      "2. Using self.camera.frame or assigning frame = self.camera.frame (or accessing frame.width/frame.height) inside VoiceoverScene without MovingCameraScene.",
      "3. Shadowing Python built-ins (str=, list=, dict=, int=, float=, len=, max=, min=, sum=, all=, any=) or calling string literals like 'text'().",
      "4. Text layouts that will obviously fail (e.g., a single Text wider than ~13 units) or titles overlapping content with no spacing.",
      "5. Long on-screen paragraphs or definition blocks—shorts must only show brief labels (≈5 words) and push full explanations into narration or sequential reveals.",
      "6. Any syntax errors or omissions that would prevent the scene from running.",
      "7. Overly complex numerical calculations or precision-heavy values; prefer simple numbers that are unlikely to cause runtime issues.",
      "",
      "When you must fix something, keep the changes minimal and preserve the author's structure.",
      "If no blocking issues are found, respond with ok=true and do not modify the script.",
      "Respond ONLY with a minimal JSON object.",
    ].join("\n")
  );

  const { text } = await generateText({
    model,
    system: verifierSystemPrompt,
    prompt: [
      "Validate the following Manim script prior to rendering.",
      "Ensure syntax, imports, class hierarchy, voiceover usage, and layout contract compliance.",
      "When problems exist, supply an updated script in fixedScript that you have re-validated against the docs.",
      "Output JSON with fields: ok (boolean), error (string optional), fixedScript (string optional). No extra text.",
      `User request: ${prompt}`,
      `Voiceover narration:\n${voiceoverScript}`,
      `Script to validate (python):\n\u0060\u0060\u0060python\n${script}\n\u0060\u0060\u0060`,
    ].join("\n\n"),
    temperature: 0,
    maxOutputTokens: 900,
    maxRetries: 1,
  });

  const raw = text.trim();

  const extractJsonString = (input: string): string | null => {
    const fenced = input.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced?.[1]) {
      return fenced[1].trim();
    }
    const firstBrace = input.indexOf("{");
    const lastBrace = input.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return input.slice(firstBrace, lastBrace + 1).trim();
    }
    return null;
  };

  const candidate = extractJsonString(raw) ?? raw;
  const isWhitespace = (char: string | undefined) =>
    char === " " || char === "\n" || char === "\r" || char === "\t";

  type VerifierRawResponse = {
    ok?: unknown;
    error?: unknown;
    fixedScript?: unknown;
  };

  const extractFixedScript = (value: unknown): string | undefined => {
    if (typeof value === "string") {
      return value;
    }

    if (Array.isArray(value)) {
      const parts = (value as unknown[]).filter(
        (item): item is string => typeof item === "string"
      );
      return parts.length ? parts.join("\n") : undefined;
    }

    if (value && typeof value === "object") {
      const candidate = (value as Record<string, unknown>).code;
      if (typeof candidate === "string") {
        return candidate;
      }
    }

    return undefined;
  };

  const normalizeResult = (
    parsed: VerifierRawResponse
  ): VerifyManimScriptResult => {
    const ok = Boolean(parsed.ok);
    const error =
      typeof parsed.error === "string" ? (parsed.error as string) : undefined;
    let fixedScript = extractFixedScript(parsed.fixedScript);

    if (fixedScript) {
      fixedScript = fixedScript
        .replace(/```python?\n?/gi, "")
        .replace(/```\n?/g, "")
        .trim();

      if (fixedScript.startsWith('"') && fixedScript.endsWith('"')) {
        try {
          fixedScript = JSON.parse(fixedScript);
        } catch {
          // ignore
        }
      }
    }

    return { ok, error, fixedScript };
  };

  const parseJsonObject = (input: string): VerifierRawResponse | null => {
    try {
      return JSON.parse(input) as VerifierRawResponse;
    } catch {
      return null;
    }
  };

  const directRaw = parseJsonObject(candidate);
  if (directRaw) {
    return normalizeResult(directRaw);
  }

  const decodeScript = (value: string): string => {
    const normalized = value.replace(/\r/g, "");
    try {
      const jsonReady = normalized
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\n/g, "\\n");
      return JSON.parse(`"${jsonReady}"`);
    } catch {
      return normalized;
    }
  };

  const malformedParse = (): VerifyManimScriptResult | null => {
    const key = '"fixedScript"';
    const keyIndex = candidate.indexOf(key);
    if (keyIndex === -1) {
      return null;
    }

    const colonIndex = candidate.indexOf(":", keyIndex + key.length);
    if (colonIndex === -1) {
      return null;
    }

    let valueIndex = colonIndex + 1;
    while (isWhitespace(candidate[valueIndex])) {
      valueIndex++;
    }

    if (candidate[valueIndex] !== '"') {
      return null;
    }

    const openingQuoteIndex = valueIndex;
    let searchIndex = openingQuoteIndex + 1;
    let closingQuoteIndex = -1;

    while (searchIndex < candidate.length) {
      const nextQuote = candidate.indexOf('"', searchIndex);
      if (nextQuote === -1) {
        break;
      }

      let backslashCount = 0;
      for (let i = nextQuote - 1; i > openingQuoteIndex; i -= 1) {
        if (candidate[i] === "\\") {
          backslashCount += 1;
        } else {
          break;
        }
      }
      const isEscaped = backslashCount % 2 === 1;
      if (isEscaped) {
        searchIndex = nextQuote + 1;
        continue;
      }

      let lookahead = nextQuote + 1;
      while (isWhitespace(candidate[lookahead])) {
        lookahead += 1;
      }

      const terminator = candidate[lookahead];
      if (
        terminator === "," ||
        terminator === "}" ||
        terminator === undefined
      ) {
        closingQuoteIndex = nextQuote;
        break;
      }

      searchIndex = nextQuote + 1;
    }

    if (closingQuoteIndex === -1) {
      return null;
    }

    const rawScript = candidate.slice(openingQuoteIndex + 1, closingQuoteIndex);
    const sanitizedJson =
      candidate.slice(0, openingQuoteIndex) +
      '""' +
      candidate.slice(closingQuoteIndex + 1);

    const parsedRaw = parseJsonObject(sanitizedJson);
    if (!parsedRaw) {
      return null;
    }

    const decoded = decodeScript(rawScript).trim();
    return normalizeResult({ ...parsedRaw, fixedScript: decoded });
  };

  const fallback = malformedParse();
  if (fallback) {
    return fallback;
  }

  return { ok: false, error: raw };
}
