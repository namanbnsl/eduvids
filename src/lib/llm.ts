import { MANIM_SYSTEM_PROMPT, VOICEOVER_SYSTEM_PROMPT } from "@/prompt";
import { generateText } from "ai";
import fs from "fs";
import path from "path";
import { createGoogleProvider } from "./google-provider";
import { selectGroqModel, GROQ_MODEL_IDS } from "./groq-provider";
import { RenderLogEntry, ValidationStage } from "@/lib/types";

const google = (modelId: string) => createGoogleProvider()(modelId);

// Retry helpers for Gemini calls
const SLEEP_MIN_MS = 30_000;
const SLEEP_MAX_MS = 40_000;
const GEMINI_MAX_RETRIES = 3; // number of retries after the initial attempt

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
const randomDelayMs = () =>
  SLEEP_MIN_MS + Math.floor(Math.random() * (SLEEP_MAX_MS - SLEEP_MIN_MS + 1));

const logRetry = (
  fnName: string,
  attempt: number,
  error: unknown,
  delayMs?: number
) => {
  const errorMsg = error instanceof Error ? error.message : String(error);
  console.warn(
    `[${fnName}] Attempt ${attempt + 1}/${
      GEMINI_MAX_RETRIES + 1
    } failed: ${errorMsg}${
      delayMs
        ? ` - retrying in ${Math.round(delayMs / 1000)}s`
        : " - no more retries"
    }`
  );
};

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

export async function generateVoiceoverScript({
  prompt,
}: VoiceoverScriptRequest): Promise<string> {
  const model = selectGroqModel(GROQ_MODEL_IDS.kimiInstruct);

  const systemPrompt = VOICEOVER_SYSTEM_PROMPT;

  const composedPrompt = [
    `User request: ${prompt}`,
    "Directive: Cover every essential idea from the request in sequence, adding extra BODY lines when needed so no core step is skipped.",
    "Directive: Keep the narration purely educational—no jokes, sound effects, or entertainment filler.",
    "Directive: Focus on a single clearly defined topic drawn from the user request—do not introduce unrelated hooks, metaphors, or tangents.",
    "Directive: Start with an engaging hook that immediately connects to the topic and states the learning objective; avoid vague rhetorical questions that are never answered.",
    "Directive: Develop each BODY line with concrete explanations, definitions, or reasoning so the listener learns how and why—not just what.",
    "Directive: Ensure the worked example and reflection lines explicitly reference the same core concept and build on prior steps.",
    "Directive: Maintain smooth flow by referencing prior steps and previewing what comes next.",
    "Directive: Whenever you use an acronym, initialism, or uppercase mnemonic, append a lowercase phonetic pronunciation in parentheses immediately after it so text-to-speech voices it correctly.",
    "Draft the narration segments:",
  ].join("\n\n");

  const { text } = await generateText({
    model,
    system: systemPrompt,
    prompt: composedPrompt,
  });

  return text.trim();
}

export async function generateManimScript({
  prompt,
  voiceoverScript,
}: ManimScriptRequest): Promise<string> {
  const augmentedSystemPrompt = buildAugmentedSystemPrompt(MANIM_SYSTEM_PROMPT);

  for (let attempt = 0; attempt <= GEMINI_MAX_RETRIES; attempt++) {
    try {
      const model = google("gemini-2.5-pro");
      const { text } = await generateText({
        model,
        system: augmentedSystemPrompt,
        prompt: `User request: ${prompt}\n\nVoiceover narration:\n${voiceoverScript}\n\nGenerate the complete Manim script that follows the narration with purposeful, step-by-step visuals that directly reinforce each narrated idea while staying on the same core topic:`,
        temperature: 0.1,
      });

      const code = text
        .replace(/```python?\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();

      return code;
    } catch (err) {
      if (attempt === GEMINI_MAX_RETRIES) {
        logRetry("generateManimScript", attempt, err);
        break;
      }
      const delayMs = randomDelayMs();
      logRetry("generateManimScript", attempt, err, delayMs);
      await sleep(delayMs);
    }
  }
  const flashModel = google("gemini-2.5-flash");
  const { text: flashText } = await generateText({
    model: flashModel,
    system: augmentedSystemPrompt,
    prompt: `User request: ${prompt}\n\nVoiceover narration:\n${voiceoverScript}\n\nGenerate the complete Manim script that follows the narration with purposeful, step-by-step visuals that directly reinforce each narrated idea while staying on the same core topic:`,
    temperature: 0.1,
  });
  const code = flashText
    .replace(/```python?\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();
  return code;
}

export async function generateYoutubeTitle({
  prompt,
  voiceoverScript,
}: ManimScriptRequest) {
  const model = selectGroqModel(GROQ_MODEL_IDS.gptOss);

  const systemPrompt =
    "You are a creative writer crafting clear, informative YouTube titles for educational videos. Keep it under 80 characters, avoid clickbait phrasing, and respond with only the final title—no quotes or extra text. Angled brackets are not allowed. ";
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
  const model = selectGroqModel(GROQ_MODEL_IDS.gptOss);

  const systemPrompt =
    "You are a content strategist who writes concise, informative YouTube descriptions for educational videos. Summaries should explain what the video covers, avoid emojis, hashtags, and marketing language, and respond only with plain text. Angled brackets are not allowed.";
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
  const augmentedSystemPrompt = buildAugmentedSystemPrompt(
    "You are a Manim Community v0.18.0 expert creating eye-catching YouTube thumbnail frames. Generate a single static frame that captures the video's essence. The scene should be visually striking, clear, and professional. Use bold text, vibrant colors, and simple shapes. DO NOT use voiceover or animations. The construct method should create all objects and add them to the scene without any animations. Use self.add() instead of self.play() for all objects."
  );

  for (let attempt = 0; attempt <= GEMINI_MAX_RETRIES; attempt++) {
    try {
      const model = google("gemini-2.5-pro");
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
          "Return ONLY the complete Python code with no commentary or markdown fences. Ensure class MyScene and def construct are included:",
        ].join("\n"),
        temperature: 0.1,
      });

      const code = text
        .replace(/```python?\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();

      return code;
    } catch (err) {
      if (attempt === GEMINI_MAX_RETRIES) {
        logRetry("generateThumbnailManimScript", attempt, err);
        break;
      }
      const delayMs = randomDelayMs();
      logRetry("generateThumbnailManimScript", attempt, err, delayMs);
      await sleep(delayMs);
    }
  }
  // Fallback to Gemini 2.5 Flash if Gemini Pro fails after retries
  const flashModel = google("gemini-2.5-flash");
  const { text: flashText } = await generateText({
    model: flashModel,
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
      "Return ONLY the complete Python code with no commentary or markdown fences. Ensure class MyScene and def construct are included:",
    ].join("\n"),
    temperature: 0.1,
  });
  const code = flashText
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

  for (let attempt = 0; attempt <= GEMINI_MAX_RETRIES; attempt++) {
    try {
      const model = google("gemini-2.5-pro");
      const { text } = await generateText({
        model,
        system: augmentedSystemPrompt,
        prompt: promptSections.join("\n\n"),
        temperature: 0.1,
      });

      const code = text
        .replace(/```python?\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();

      return code;
    } catch (err) {
      if (attempt === GEMINI_MAX_RETRIES) {
        logRetry("regenerateManimScriptWithError", attempt, err);
        break;
      }
      const delayMs = randomDelayMs();
      logRetry("regenerateManimScriptWithError", attempt, err, delayMs);
      await sleep(delayMs);
    }
  }
  // Fallback to Gemini 2.5 Flash if Gemini Pro fails after retries
  const flashModel = google("gemini-2.5-flash");
  const { text: flashText } = await generateText({
    model: flashModel,
    system: augmentedSystemPrompt,
    prompt: promptSections.join("\n\n"),
    temperature: 0.1,
  });
  const code = flashText
    .replace(/```python?\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();
  return code;
}
