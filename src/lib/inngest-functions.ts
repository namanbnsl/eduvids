// Inngest
import { NonRetriableError } from "inngest";
import { inngest } from "./inngest";

// LLM
import {
  generateManimScript,
  generateVoiceoverScript,
  regenerateManimScriptWithError,
  generateYoutubeDescription,
  generateYoutubeTitle,
} from "./llm";

// Rendering
import { renderManimVideo, RenderLifecycleStage } from "./e2b";
import { Sandbox } from "@e2b/code-interpreter";

// Youtube & Uploads
import { uploadVideo } from "./uploadthing";
import { uploadToYouTube } from "./youtube";

// Jobs
import { jobStore } from "./job-store";
// Prompts
import { VOICEOVER_SERVICE_IMPORT, VOICEOVER_SERVICE_SETTER } from "@/prompt";

// Types
import type {
  ManimGenerationAttempt,
  ManimGenerationErrorDetails,
} from "./llm";
import type {
  VideoVariant,
  RenderLogEntry,
  ValidationStage,
  HeuristicIssue,
  HeuristicOptions,
  RenderAttemptSuccess,
  RenderProcessError,
} from "./types";

import { TwitterApi } from "twitter-api-v2";

const MAX_RENDER_LOG_ENTRIES = 200;

type JobProgressUpdate = {
  progress?: number;
  step?: string;
  details?: string;
};

const RENDER_STAGE_PROGRESS: Partial<
  Record<RenderLifecycleStage, { progress: number; step: string }>
> = {
  sandbox: { progress: 46, step: "Preparing environment" },
  "layout-injection": { progress: 48, step: "Setting up" },
  prepare: { progress: 50, step: "Uploading" },
  syntax: { progress: 52, step: "Checking" },
  "ast-guard": { progress: 54, step: "Validating" },
  "scene-validation": { progress: 56, step: "Validating" },
  "plugin-installation": { progress: 58, step: "Installing" },
  latex: { progress: 60, step: "Preparing LaTeX" },
  render: { progress: 66, step: "Rendering" },
  "render-output": { progress: 70, step: "Done rendering" },
  files: { progress: 72, step: "Processing" },
  "video-validation": { progress: 75, step: "Checking video" },
  "video-processing": { progress: 78, step: "Processing" },
  watermark: { progress: 82, step: "Adding watermark" },
  "watermark-validation": { progress: 84, step: "Finalizing" },
};

const formatStepLabel = (value: string): string =>
  value
    .split(/[-_\s]+/)
    .map((word) =>
      word.length > 0 ? `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}` : ""
    )
    .join(" ");

const stageToJobUpdate = (stage: RenderLifecycleStage) =>
  RENDER_STAGE_PROGRESS[stage] ?? {
    progress: 60,
    step: formatStepLabel(stage),
  };

const updateJobProgress = async (
  jobId: string | undefined,
  update: JobProgressUpdate
) => {
  if (!jobId) return;
  try {
    await jobStore.setProgress(jobId, update);
  } catch (error) {
    console.warn("Failed to update job progress", { jobId, update, error });
  }
};

const pruneRenderLogs = (
  logs: RenderLogEntry[] | undefined
): RenderLogEntry[] => {
  if (!Array.isArray(logs) || logs.length === 0) return [];
  if (logs.length <= MAX_RENDER_LOG_ENTRIES) return logs;
  return logs.slice(-MAX_RENDER_LOG_ENTRIES);
};

const REQUIRED_IMPORTS = [
  "from manim import",
  "from manim_voiceover import VoiceoverScene",
  VOICEOVER_SERVICE_IMPORT,
];

const PROSE_PHRASES = [
  "here is",
  "here's",
  "sure",
  "certainly",
  "explanation",
  "an analysis",
  "analysis of",
  "let's",
  "in this video",
  "we will",
  "i will",
  "first,",
  "second,",
  "finally",
  "overall",
];

const MARKDOWN_LIKE_PATTERNS = [/```/, /\[[^\]]+\]\([^\)]+\)/];

const CODE_LINE_PATTERNS = [
  /^(?:from|import|class|def|with|for|while|if|elif|else|try|except|finally|return|yield|async|await|pass|raise|break|continue|@)/,
  /^(?:FRAME_|SAFE_|config\.)/,
  /^(?:await\s+)?[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*\s*(?:=|\()/,
  /^[\[({]/,
  /^[})\]]+$/,
];

const STRING_LITERAL_PLACEHOLDER = " ";

const replaceWithPlaceholderPreservingNewlines = (value: string): string =>
  value.replace(/[^\n]/g, STRING_LITERAL_PLACEHOLDER);

const BUILTIN_SHADOWING_PATTERNS = [
  /\bstr\s*=\s*["']/i,
  /\blist\s*=\s*\[/i,
  /\bdict\s*=\s*\{/i,
  /\bint\s*=\s*\d/i,
  /\bfloat\s*=\s*\d/i,
  /\b(float|int)\s*=\s*[\w.]+/i,
  /\blen\s*=\s*/i,
  /\bmax\s*=\s*/i,
  /\bmin\s*=\s*/i,
];

const STRING_CALL_PATTERN = /(?<![A-Za-z0-9_])(['"][^'"]+['"])\s*\(/;

const stripStringLiterals = (source: string): string =>
  source
    .replace(/'''[\s\S]*?'''/g, replaceWithPlaceholderPreservingNewlines)
    .replace(/"""[\s\S]*?"""/g, replaceWithPlaceholderPreservingNewlines)
    .replace(/"(?:\\.|[^"\\])*"/g, (match) =>
      match.replace(/./g, STRING_LITERAL_PLACEHOLDER)
    )
    .replace(/'(?:\\.|[^'\\])*'/g, (match) =>
      match.replace(/./g, STRING_LITERAL_PLACEHOLDER)
    );

const formatIssueList = (issues: HeuristicIssue[]): string =>
  issues.map((issue, index) => `${index + 1}. ${issue.message}`).join("\n");

const clampDetail = (value?: string, limit = 2000): string | undefined => {
  if (!value) return undefined;
  return value.length > limit ? value.slice(0, limit) : value;
};

const sanitizeStepComponent = (value: string | number): string =>
  String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const buildStepId = (...parts: Array<string | number | undefined>): string => {
  const sanitized = parts
    .map((part) => (part === undefined ? "" : sanitizeStepComponent(part)))
    .filter((part) => part.length > 0);
  return sanitized.length ? sanitized.join("-") : "step";
};

const formatJobError = (
  error: unknown
): {
  message: string;
  detail?: string;
} => {
  const fallbackMessage =
    "Something went wrong while generating your video. Please try again or contact support.";
  let message = fallbackMessage;
  let detail: string | undefined = undefined;
  if (error && typeof error === "object") {
    if (
      error instanceof Error &&
      typeof error.message === "string" &&
      error.message.length < 160
    ) {
      message = error.message;
    } else if (
      "message" in error &&
      typeof (error as { message?: unknown }).message === "string" &&
      (error as { message: string }).message.length < 160
    ) {
      message = (error as { message: string }).message;
    }
    const hint =
      "hint" in error ? (error as { hint?: unknown }).hint : undefined;
    const exitCode =
      "exitCode" in error
        ? (error as { exitCode?: unknown }).exitCode
        : undefined;
    if (hint && typeof hint === "string" && hint.length < 160) {
      detail = hint;
    } else if (typeof exitCode === "number") {
      detail = `Exited with code ${exitCode}`;
    }
  } else if (typeof error === "string" && error.length < 160) {
    message = error;
  }
  return { message, detail };
};

function validateRequiredElements(script: string): {
  ok: boolean;
  error?: string;
} {
  const normalized = script.trim().replace(/\r/g, "");
  const issues: string[] = [];

  // Check all required imports
  for (const requiredImport of REQUIRED_IMPORTS) {
    if (!normalized.includes(requiredImport)) {
      issues.push(`Missing required import: ${requiredImport}`);
    }
  }

  // Check for class MyScene
  if (!normalized.includes("class MyScene")) {
    issues.push("Missing class MyScene definition");
  }

  // Check for construct method
  if (!normalized.includes("def construct(self)")) {
    issues.push("Missing def construct(self) method");
  }

  // Check for set_speech_service
  if (!normalized.includes("set_speech_service")) {
    issues.push(`Missing ${VOICEOVER_SERVICE_SETTER} call`);
  }

  if (issues.length > 0) {
    return {
      ok: false,
      error: `Script validation failed - missing required elements:\n${issues
        .map((issue, idx) => `${idx + 1}. ${issue}`)
        .join("\n")}`,
    };
  }

  return { ok: true };
}

function runHeuristicChecks(
  script: string,
  options: HeuristicOptions = {}
): { ok: boolean; error?: string } {
  const allowVerificationFixes = options.allowVerificationFixes ?? false;
  const issues: HeuristicIssue[] = [];
  const trimmed = script.trim();

  if (!trimmed) {
    issues.push({
      message: "❌ Script is empty after trimming.",
      severity: "critical",
    });
  }

  const normalized = trimmed.replace(/\r/g, "");
  const stripped = stripStringLiterals(normalized);
  const normalizedLines = normalized.split(/\n/);
  const strippedLines = stripped.split(/\n/);

  const isLikelyCodeLine = (rawLine: string): boolean => {
    const line = rawLine.trim();
    if (!line) return false;
    if (line.startsWith("#")) return false;
    if (line === '"""' || line === "'''") return false;
    if (CODE_LINE_PATTERNS.some((pattern) => pattern.test(line))) {
      return true;
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(line) && !line.includes("==")) {
      return true;
    }
    if (line.endsWith(":")) {
      return true;
    }
    if (/\w\s*\(/.test(line) && line.includes(")")) {
      return true;
    }
    return false;
  };

  const firstCodeLineIndex = normalizedLines.findIndex((line) =>
    isLikelyCodeLine(line)
  );

  const preambleEndIndex =
    firstCodeLineIndex === -1 ? normalizedLines.length : firstCodeLineIndex;
  if (preambleEndIndex > 0) {
    const preambleOriginal = normalizedLines
      .slice(0, preambleEndIndex)
      .join("\n");
    const preambleStripped = strippedLines
      .slice(0, preambleEndIndex)
      .join("\n")
      .toLowerCase();

    for (const pattern of MARKDOWN_LIKE_PATTERNS) {
      if (pattern.test(preambleOriginal)) {
        issues.push({
          message:
            "❌ Detected Markdown or formatting artifacts before the first code line. Provide code only.",
          severity: "noncode",
        });
        break;
      }
    }

    for (const phrase of PROSE_PHRASES) {
      if (preambleStripped.includes(phrase)) {
        issues.push({
          message: `❌ Narrative/explanatory text detected before the first code line (contains "${phrase}"). Provide only executable Manim code.`,
          severity: "noncode",
        });
        break;
      }
    }

    const preambleLines = normalizedLines.slice(0, preambleEndIndex);
    for (let index = 0; index < preambleLines.length; index++) {
      const rawLine = preambleLines[index] ?? "";
      const line = rawLine.trim();
      if (!line) continue;
      if (line.startsWith("#")) continue;
      if (line === '"""' || line === "'''") continue;

      const strippedLine = strippedLines[index]?.trim() ?? "";
      const hasCodeSymbols = /[(){}\[\]=:+\-*/.,]/.test(line);
      const wordCount = strippedLine
        ? strippedLine.split(/\s+/).filter(Boolean).length
        : 0;

      if (wordCount >= 4 && !hasCodeSymbols) {
        issues.push({
          message: `❌ Non-code narrative detected before the first code line (line ${
            index + 1
          }): "${line.slice(0, 80)}"`,
          severity: "noncode",
        });
        break;
      }
    }
  }

  if (normalized.includes("VoiceoverScene")) {
    const referencesCameraFrame = normalized.includes("self.camera.frame");
    const assignsCameraFrame = /frame\s*=\s*self\.camera\.frame/.test(
      normalized
    );
    const usesMovingCamera = normalized.includes("MovingCameraScene");

    if (referencesCameraFrame && !usesMovingCamera) {
      issues.push({
        message:
          "❌ VoiceoverScene does not have camera.frame. Remove camera.frame references or inherit from MovingCameraScene.",
        severity: "fixable",
      });
    }

    if (assignsCameraFrame && !usesMovingCamera) {
      issues.push({
        message:
          "❌ Cannot assign frame = self.camera.frame in VoiceoverScene. Use FRAME_WIDTH/FRAME_HEIGHT constants instead.",
        severity: "fixable",
      });
    }
  }

  // Check for required imports more strictly
  for (const requiredImport of REQUIRED_IMPORTS) {
    if (!normalized.includes(requiredImport)) {
      issues.push({
        message: `❌ Missing required import: ${requiredImport}`,
        severity: "fixable",
      });
    }
  }

  // Verify "from manim import" is present (catch all)
  if (!normalized.includes("from manim import")) {
    issues.push({
      message: "❌ Missing: from manim import * (or specific imports)",
      severity: "fixable",
    });
  }

  if (!normalized.includes("class MyScene")) {
    issues.push({
      message: "❌ Missing: class MyScene definition.",
      severity: "fixable",
    });
  }

  if (!normalized.includes("def construct(self)")) {
    issues.push({
      message: "❌ Missing: def construct(self) method.",
      severity: "fixable",
    });
  }

  if (
    normalized.includes("VoiceoverScene") &&
    !normalized.includes("set_speech_service")
  ) {
    issues.push({
      message: `❌ VoiceoverScene requires ${VOICEOVER_SERVICE_SETTER}.`,
      severity: "fixable",
    });
  }

  for (const pattern of BUILTIN_SHADOWING_PATTERNS) {
    if (pattern.test(normalized)) {
      const match = normalized.match(pattern);
      issues.push({
        message: `❌ Shadowing built-in name detected: ${match?.[0]}. Use a different variable name to avoid "'str' object is not callable" errors.`,
        severity: "fixable",
      });
      break;
    }
  }

  if (STRING_CALL_PATTERN.test(normalized)) {
    issues.push({
      message:
        "❌ Potential error: calling a string literal like a function (e.g., 'text'()). Use Text('text') instead.",
      severity: "fixable",
    });
  }

  // Check for problematic MathTex patterns that split badly
  const PROBLEMATIC_MATHTEX_PATTERNS = [
    // Consecutive fractions with operators: \frac{a}{b} + \frac{c}{d}
    /MathTex\([^)]*\\frac\{[^}]+\}\{[^}]+\}\s*[+\-*/]\s*\\frac\{[^}]+\}\{[^}]+\}/,
    // Long chains of fractions: \frac{1}{1} + \frac{1}{2} + \frac{1}{3} + ...
    /MathTex\([^)]*(?:\\frac\{[^}]+\}\{[^}]+\}\s*[+\-*/]\s*){3,}/,
    // Incomplete exponent patterns that split badly: 1^s} +
    /MathTex\([^)]*\^\{[^}]+\}\s*[+\-*/]/,
  ];

  for (const pattern of PROBLEMATIC_MATHTEX_PATTERNS) {
    if (pattern.test(normalized)) {
      issues.push({
        message:
          "❌ MathTex with problematic LaTeX pattern detected. Long chains of fractions or complex nested structures can split into invalid LaTeX fragments during animation. Use summation notation (\\sum), break into multiple MathTex objects, or explicitly isolate substrings.",
        severity: "fixable",
      });
      break;
    }
  }

  // Check for unbalanced braces in LaTeX strings
  const LATEX_STRING_PATTERN = /r?["']([^"']*)["']/g;
  let latexMatch: RegExpExecArray | null;
  while ((latexMatch = LATEX_STRING_PATTERN.exec(normalized)) !== null) {
    const content = latexMatch[1];
    if (content.includes("\\")) {
      // Only check strings that look like LaTeX
      let balance = 0;
      for (const char of content) {
        if (char === "{") balance++;
        else if (char === "}") balance--;
      }
      if (balance !== 0) {
        issues.push({
          message: `❌ Unbalanced braces detected in LaTeX string: "${content.slice(
            0,
            50
          )}...". Check your { and } usage.`,
          severity: "fixable",
        });
        break; // One is enough to fail
      }
    }
  }

  // Check for invalid \color usage in MathTex
  if (/MathTex\s*\(\s*r?["'][^"']*\\color\{/.test(normalized)) {
    issues.push({
      message:
        "❌ Invalid use of \\color{} inside MathTex. Use the `color` keyword argument or `tex_to_color_map` instead.",
      severity: "fixable",
    });
  }

  // Check for double backslashes in raw strings
  if (/r["'][^"']*\\\\/.test(normalized)) {
    issues.push({
      message:
        '❌ Double backslashes detected in raw string (r"..."). In raw strings, use single backslashes for LaTeX commands (e.g., r"\\frac" not r"\\\\frac").',
      severity: "fixable",
    });
  }

  // Check for hallucinated Manim properties
  const HALLUCINATED_PROPS = [
    "text_align",
    "set_style",
    "set_font_size",
    "set_text_color",
  ];
  for (const prop of HALLUCINATED_PROPS) {
    if (normalized.includes(`.${prop}(`)) {
      issues.push({
        message: `❌ Hallucinated property detected: .${prop}(). This method does not exist in Manim. Check the documentation or use standard methods like .set_color(), .scale(), etc.`,
        severity: "fixable",
      });
    }
  }

  const FONT_SIZE_PATTERN = /font_size\s*=\s*([0-9]+(?:\.[0-9]+)?)/g;
  const ALLOWED_FONT_SIZES = [20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 46];
  const TEXT_CONSTRUCTOR_PATTERN =
    /\b(Text|MathTex|Tex|TexText|MarkupText|Paragraph)\s*\(/g;
  const missingFontSizeConstructors = new Set<string>();
  const scanConstructorsForFontSize = () => {
    TEXT_CONSTRUCTOR_PATTERN.lastIndex = 0;
    let constructorMatch: RegExpExecArray | null;
    while (
      (constructorMatch = TEXT_CONSTRUCTOR_PATTERN.exec(normalized)) !== null
    ) {
      const constructorName = constructorMatch[1] ?? "Text";
      let cursor = TEXT_CONSTRUCTOR_PATTERN.lastIndex;
      let depth = 1;
      let inString: string | null = null;
      let escaped = false;
      let hasFontSize = false;

      for (; cursor < normalized.length; cursor++) {
        const char = normalized[cursor];

        if (inString) {
          if (escaped) {
            escaped = false;
            continue;
          }
          if (char === "\\") {
            escaped = true;
            continue;
          }
          if (char === inString) {
            inString = null;
          }
          continue;
        }

        if (char === "'" || char === '"') {
          inString = char;
          continue;
        }

        if (char === "(") {
          depth += 1;
          continue;
        }

        if (char === ")") {
          depth -= 1;
          if (depth === 0) {
            cursor += 1;
            break;
          }
          continue;
        }

        if (
          depth === 1 &&
          normalized.slice(cursor, cursor + 9).startsWith("font_size")
        ) {
          hasFontSize = true;
        }
      }

      if (!hasFontSize) {
        missingFontSizeConstructors.add(constructorName);
      }

      TEXT_CONSTRUCTOR_PATTERN.lastIndex = cursor;
    }
  };

  scanConstructorsForFontSize();
  let fontSizeMatch: RegExpExecArray | null;
  while ((fontSizeMatch = FONT_SIZE_PATTERN.exec(normalized)) !== null) {
    const rawValue = fontSizeMatch[1];
    const numericValue = Number.parseFloat(rawValue);
    if (!Number.isFinite(numericValue)) {
      continue;
    }
    const usesAllowedFont = ALLOWED_FONT_SIZES.some(
      (allowed) => Math.abs(numericValue - allowed) < 0.01
    );
    if (!usesAllowedFont) {
      issues.push({
        message: `❌ Non-standard font_size=${rawValue} detected. Use only ${ALLOWED_FONT_SIZES.join(
          ", "
        )} to keep typography compact and within the safe zone.`,
        severity: "fixable",
      });
      break;
    }
  }

  if (missingFontSizeConstructors.size > 0) {
    issues.push({
      message: `❌ Missing font_size on ${Array.from(
        missingFontSizeConstructors
      ).join(", ")}. Set font_size to one of ${ALLOWED_FONT_SIZES.join(
        ", "
      )} so text stays within the reduced typography scale.`,
      severity: "fixable",
    });
  }

  const SCALE_PATTERN = /\.scale\(\s*([0-9]+(?:\.[0-9]+)?)\s*(?:[,)]|$)/g;
  let scaleMatch: RegExpExecArray | null;
  while ((scaleMatch = SCALE_PATTERN.exec(normalized)) !== null) {
    const rawValue = scaleMatch[1];
    const numericValue = Number.parseFloat(rawValue);
    if (!Number.isFinite(numericValue)) {
      continue;
    }
    if (numericValue > 1.3) {
      issues.push({
        message: `❌ Detected scale(${rawValue}) which enlarges objects beyond the safe typography range. Split content or adjust layout instead of scaling above 1.3x.`,
        severity: "fixable",
      });
      break;
    }
  }

  const SCALE_TO_FIT_WIDTH_PATTERN =
    /\.scale_to_fit_width\(\s*([0-9]+(?:\.[0-9]+)?)\s*(?:[,)]|$)/g;
  let scaleToFitMatch: RegExpExecArray | null;
  while (
    (scaleToFitMatch = SCALE_TO_FIT_WIDTH_PATTERN.exec(normalized)) !== null
  ) {
    const rawValue = scaleToFitMatch[1];
    const numericValue = Number.parseFloat(rawValue);
    if (!Number.isFinite(numericValue)) {
      continue;
    }
    if (numericValue > 10.2) {
      issues.push({
        message: `❌ scale_to_fit_width(${rawValue}) exceeds the 10-unit safe width. Keep text groups within the frame and use the approved font sizes instead.`,
        severity: "fixable",
      });
      break;
    }
  }

  const relevantIssues = allowVerificationFixes
    ? issues.filter((issue) => issue.severity !== "fixable")
    : issues;

  if (relevantIssues.length === 0) {
    return { ok: true };
  }

  return {
    ok: false,
    error: `Heuristic validation failed:\n${formatIssueList(relevantIssues)}`,
  };
}

function buildYouTubeTitle(params: {
  prompt?: string;
  voiceoverScript?: string;
}): string {
  const { prompt, voiceoverScript } = params;

  const sanitize = (input: string) =>
    input
      .replace(/[\r\n]+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[\p{Cf}\u0000-\u001F]/gu, "");

  const capitalize = (input: string) =>
    input.length ? input[0].toUpperCase() + input.slice(1) : input;

  const clamp = (input: string, max: number) =>
    input.length <= max ? input : input.slice(0, max).trim();

  let candidate = sanitize(prompt ?? "");
  if (!candidate && voiceoverScript) {
    const firstLine =
      voiceoverScript.split(/\r?\n/).find((l) => sanitize(l).length > 0) ?? "";
    candidate = sanitize(firstLine);
  }

  candidate = candidate.replace(/[\s.,;:!?-]+$/g, "");
  candidate = capitalize(candidate);

  // YouTube title max length is 100 characters
  candidate = clamp(candidate, 100);

  if (!candidate) {
    throw new Error("Cannot build a non-empty YouTube title from inputs");
  }

  return candidate;
}

function buildYouTubeDescription(params: {
  prompt?: string;
  voiceoverScript?: string;
}): string | undefined {
  const { prompt, voiceoverScript } = params;
  const sanitize = (input: string) =>
    input
      .replace(/```[\s\S]*?```/g, "")
      .replace(/\[[^\]]+\]\([^\)]+\)/g, "$1")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      .replace(/_(.*?)_/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/[\r\n]+/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

  const clamp = (input: string, max: number) =>
    input.length <= max ? input : `${input.slice(0, max).trim()}…`;

  const candidatePrompt = sanitize(prompt ?? "");
  if (candidatePrompt) {
    return clamp(candidatePrompt, 2000);
  }

  const candidateLine = (voiceoverScript ?? "")
    .split(/\r?\n/)
    .map((line) => sanitize(line))
    .find((line) => line.length > 0);

  if (candidateLine) {
    return clamp(candidateLine, 2000);
  }

  return undefined;
}

export const generateVideo = inngest.createFunction(
  {
    id: "generate-manim-video",
    timeouts: { start: "25m", finish: "90m" },
    retries: 0, // Disable automatic retries; handle regeneration manually
  },
  { event: "video/generate.request" },
  async ({ event, step }) => {
    const {
      prompt,
      userId,
      chatId,
      jobId,
      variant: rawVariant,
    } = event.data as {
      prompt: string;
      userId: string;
      chatId: string;
      jobId?: string;
      variant?: VideoVariant;
    };

    const variant: VideoVariant = rawVariant === "short" ? "short" : "video";
    const generationPrompt =
      variant === "short"
        ? `${prompt}\n\nThe final output must be a YouTube-ready vertical (9:16) short under one minute. Keep narration concise and design visuals for portrait orientation. The layout system automatically provides larger font constants optimized for portrait (FONT_TITLE=46, FONT_HEADING=36, FONT_BODY=32, FONT_CAPTION=28, FONT_LABEL=26) - always use these constants instead of hardcoded sizes. Split copy across multiple lines for readability, keep visual groups within the safe content area, and leave proper clearance between arrows, labels, and nearby objects using the auto-calculated margins.`
        : prompt;

    console.log(
      ` Starting ${
        variant === "short" ? "vertical short" : "full video"
      } generation for prompt: "${prompt}"`
    );

    const verifyScriptWithAutoFix = async ({
      scriptToCheck,
      context,
      narration,
      stepBaseParts,
      jobId,
      progressFloor,
    }: {
      scriptToCheck: string;
      context: string;
      narration: string;
      stepBaseParts: ReadonlyArray<string | number | undefined>;
      jobId?: string;
      progressFloor?: number;
    }): Promise<string> => {
      const defaultBase = 30;
      const baseProgress =
        typeof progressFloor === "number" ? progressFloor : defaultBase;
      let validationProgress = baseProgress;
      let lastValidationSignature: string | undefined;
      const translateProgress = (target: number) => {
        const offset = target - defaultBase;
        return Math.max(baseProgress, baseProgress + offset);
      };
      const markValidationStage = async (
        targetProgress: number,
        stepLabel: string,
        detail?: string
      ) => {
        const desired = translateProgress(targetProgress);
        validationProgress = Math.max(validationProgress, desired);
        const normalizedDetail = detail ?? context;
        const signature = `${validationProgress}:${stepLabel}:${normalizedDetail}`;
        if (signature === lastValidationSignature) return;
        lastValidationSignature = signature;
        await updateJobProgress(jobId, {
          progress: validationProgress,
          step: stepLabel,
          details: normalizedDetail,
        });
      };
      await markValidationStage(30, "verifying script", context);
      const MAX_VERIFY_PASSES = 1;
      const limitHistory = <T>(history: T[], max: number) => {
        if (history.length <= max) return;
        history.splice(0, history.length - max);
      };
      const baseStepParts = stepBaseParts;
      const seenScripts = new Set<string>();
      const attemptHistory: ManimGenerationAttempt[] = [];
      let current = scriptToCheck.trim();
      let lastError: string | undefined;

      for (let pass = 1; pass <= MAX_VERIFY_PASSES; pass++) {
        if (seenScripts.has(current)) {
          throw new Error(
            `Auto-fix loop detected during ${context}; the verifier repeated a script it previously evaluated. Last error: ${
              lastError ?? "unknown"
            }`
          );
        }
        seenScripts.add(current);
        await markValidationStage(
          Math.min(36, 30 + pass * 2),
          `script validation pass ${pass}`,
          context
        );

        const result = await step.run(
          buildStepId(...baseStepParts, "pass", pass),
          async () => {
            const trimmedCurrent = current.trim();
            const baselineCheck = runHeuristicChecks(trimmedCurrent, {
              allowVerificationFixes: true,
            });

            if (!baselineCheck.ok) {
              return {
                ok: false,
                error: baselineCheck.error,
                fixedScript: trimmedCurrent,
              };
            }

            const postCheck = runHeuristicChecks(trimmedCurrent);

            if (postCheck.ok) {
              return {
                ok: true,
                fixedScript: trimmedCurrent,
              };
            }

            if (!postCheck.error) {
              return {
                ok: false,
                fixedScript: trimmedCurrent,
              };
            }

            const attemptHistoryForRegeneration = (() => {
              const history = [...attemptHistory];
              history.push({
                attemptNumber: pass,
                script: trimmedCurrent,
                error: { message: postCheck.error },
              });
              if (history.length > 3) {
                history.splice(0, history.length - 3);
              }
              return history;
            })();

            const regenerated = await regenerateManimScriptWithError({
              prompt: generationPrompt,
              voiceoverScript: narration,
              previousScript: trimmedCurrent,
              error: postCheck.error,
              attemptNumber: pass,
              attemptHistory: attemptHistoryForRegeneration,
              blockedScripts: Array.from(seenScripts),
            });

            const trimmedRegenerated = regenerated.trim();

            if (!trimmedRegenerated) {
              throw new Error(
                `Regeneration returned an empty script during ${context} pass ${pass}`
              );
            }

            return {
              ok: false,
              error: postCheck.error,
              fixedScript: trimmedRegenerated,
            };
          }
        );

        if (result.ok) {
          const approvedScript =
            result.fixedScript && result.fixedScript.trim().length > 0
              ? result.fixedScript.trim()
              : current;

          if (approvedScript !== current) {
            console.log(
              `Verifier approved script with inline corrections on pass ${pass} (${context}).`
            );
          } else if (pass > 1) {
            console.log(
              `Verifier approved script after ${pass} passes (${context}).`
            );
          }

          await markValidationStage(40, "Scenes approved", `Done`);
          return approvedScript;
        }

        lastError = "error" in result ? result.error : undefined;

        if (lastError) {
          await markValidationStage(
            Math.min(38, 32 + pass * 2),
            `regenerating script (pass ${pass})`,
            "Fixing script issues"
          );
        }

        if (lastError) {
          attemptHistory.push({
            attemptNumber: pass,
            script: current,
            error: { message: lastError },
          });
          limitHistory(attemptHistory, 3);
        }

        let nextScript: string | undefined;

        if (result.fixedScript && result.fixedScript.trim().length > 0) {
          nextScript = result.fixedScript.trim();
          console.log(
            `Verifier produced a corrected script for ${context} on pass ${pass} (length: ${nextScript.length}).`
          );
        } else {
          console.warn(
            `Verifier did not return a fix for ${context} on pass ${pass}; regenerating with error feedback.`
          );
          nextScript = await step.run(
            buildStepId(...baseStepParts, "regen", "pass", pass),
            async () => {
              const regenerated = await regenerateManimScriptWithError({
                prompt: generationPrompt,
                voiceoverScript: narration,
                previousScript: current,
                error: lastError ?? "Unknown verification error",
                attemptNumber: pass,
                attemptHistory,
              });
              const trimmed = regenerated.trim();
              if (!trimmed) {
                throw new Error(
                  `Regeneration returned an empty script during ${context} pass ${pass}`
                );
              }
              return trimmed;
            }
          );
        }

        if (!nextScript || nextScript.trim().length === 0) {
          throw new Error(
            `Verifier reported issues during ${context} but produced an empty fix: ${
              lastError ?? "unknown"
            }`
          );
        }

        current = nextScript;
      }

      console.warn(
        `Verifier could not approve the script during ${context} after ${MAX_VERIFY_PASSES} passes. Last error: ${
          lastError ?? "unknown"
        } — proceeding with the best-effort script.`
      );
      return current;
    };

    const fingerprintScript = (code: string) =>
      code
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .join("\n");

    try {
      await updateJobProgress(jobId, {
        progress: 5,
        step: "Creating narration",
        details: "Writing script",
      });
      const voiceoverScript = await step.run(
        "generate-voiceover-script",
        async () => {
          return await generateVoiceoverScript({ prompt: generationPrompt });
        }
      );

      console.log(" Voiceover script generated", {
        length: voiceoverScript.length,
      });

      await updateJobProgress(jobId, {
        progress: 12,
        step: "Narration ready",
        details: "Done",
      });

      await updateJobProgress(jobId, {
        progress: 18,
        step: "Writing scenes",
        details: "Creating",
      });

      let script = await step.run("generate-full-manim-script", async () => {
        return await generateManimScript({
          prompt: generationPrompt,
          voiceoverScript,
        });
      });

      console.log(" Initial Manim script generated", {
        length: script.length,
      });

      await updateJobProgress(jobId, {
        progress: 24,
        step: "Scenes ready",
        details: "Code ready",
      });

      await updateJobProgress(jobId, {
        progress: 30,
        step: "Checking scenes",
        details: "Validating",
      });

      const preValidation = validateRequiredElements(script);
      if (!preValidation.ok) {
        throw new Error(
          `Full video script failed pre-validation: ${preValidation.error}`
        );
      }

      script = await verifyScriptWithAutoFix({
        scriptToCheck: script,
        context: "full video script",
        narration: voiceoverScript,
        stepBaseParts: ["video", "verify", "initial"],
        jobId,
      });

      console.log("Manim script verified", {
        length: script.length,
      });

      await updateJobProgress(jobId, {
        progress: 42,
        step: "Ready to render",
        details: "Validation complete",
      });

      await updateJobProgress(jobId, {
        progress: 44,
        step: "Starting render",
        details: "Setting up",
      });

      const MAX_RENDER_RETRIES = 3;
      const MAX_FORCE_REGENERATIONS = 2;
      const ATTEMPT_HISTORY_LIMIT = 3;
      // const MAX_UPLOAD_ATTEMPTS = 2;

      const pipelineWarnings: Array<{
        stage: ValidationStage;
        message: string;
      }> = [];

      let currentScript = script;
      const failedAttempts: ManimGenerationAttempt[] = [];
      const blockedScripts = new Map<string, string>();
      const addBlockedScript = (code: string) => {
        const trimmed = code.trim();
        if (!trimmed) return;
        const fingerprint = fingerprintScript(trimmed);
        if (!blockedScripts.has(fingerprint)) {
          blockedScripts.set(fingerprint, trimmed);
        }
      };

      addBlockedScript(currentScript);

      let renderOutcome: RenderAttemptSuccess | undefined;
      let renderAttempts = 0;

      for (let attempt = 1; attempt <= MAX_RENDER_RETRIES; attempt++) {
        const attemptStart = Date.now();
        console.log(
          ` Render attempt ${attempt}/${MAX_RENDER_RETRIES} starting`
        );

        try {
          // Time-boxed render execution with continuation support
          const STEP_TIMEOUT_MS = 4 * 60 * 1000; // 4 minutes
          const SAFETY_MARGIN_MS = 30 * 1000; // 30 second safety margin
          const MAX_POLL_ITERATIONS = 20; // Max 20 iterations (80 minutes total)

          let renderExecution: RenderAttemptSuccess | undefined;
          let sandboxId: string | undefined; // Track sandbox ID across iterations

          for (
            let pollIteration = 0;
            pollIteration < MAX_POLL_ITERATIONS;
            pollIteration++
          ) {
            const stepId = buildStepId(
              "video",
              "render",
              "attempt",
              attempt,
              "poll",
              pollIteration
            );

            const pollResult = await step.run(stepId, async () => {
              try {
                const usesManimML = currentScript.includes("manim_ml");

                const renderPromise = renderManimVideo({
                  script: currentScript,
                  prompt,
                  applyWatermark: true,
                  renderOptions:
                    variant === "short"
                      ? {
                          orientation: "portrait",
                          resolution: { width: 720, height: 1280 },
                        }
                      : undefined,
                  plugins: usesManimML ? ["manim-ml"] : [],
                  onProgress: async ({
                    stage,
                    message,
                    sandboxId: progressSandboxId,
                  }) => {
                    // Capture sandboxId as soon as it's reported (before timeout)
                    if (progressSandboxId && !sandboxId) {
                      sandboxId = progressSandboxId;
                      console.log(`📦 Captured sandbox ID: ${sandboxId}`);
                    }
                    const mapping = stageToJobUpdate(stage);
                    await updateJobProgress(jobId, {
                      progress: mapping.progress,
                      step: mapping.step,
                      details: message,
                    });
                  },
                  existingSandboxId: sandboxId, // Pass sandbox ID for reuse
                });

                // Create timeout promise
                // NOTE: Promise.race won't cancel the renderManimVideo process.
                // However, this pattern still prevents FUNCTION_INVOCATION_TIMEOUT by:
                // 1. Allowing the step to complete before Inngest's timeout
                // 2. The render process continues in the sandbox
                // 3. Next iteration can check if render completed or continue racing
                // The E2B sandbox manages the actual process lifecycle.
                const timeoutPromise = new Promise<{ continue: true }>(
                  (resolve) => {
                    setTimeout(() => {
                      resolve({ continue: true });
                    }, STEP_TIMEOUT_MS - SAFETY_MARGIN_MS);
                  }
                );

                // Race between render and timeout
                const raceResult = await Promise.race([
                  renderPromise.then((result) => ({ result, continue: false })),
                  timeoutPromise,
                ]);

                if ("continue" in raceResult && raceResult.continue) {
                  // Timeout reached, continue in next iteration
                  console.log(
                    `⏱️  Render step ${pollIteration} approaching timeout, will continue in next step`
                  );
                  await updateJobProgress(jobId, {
                    progress: Math.min(85, 46 + pollIteration * 2),
                    step: "Rendering (cont.)",
                    details: `Continuing render (step ${pollIteration + 1})`,
                  });
                  // Return sandboxId to persist it across iterations
                  return { continue: true, sandboxId };
                }

                // Render completed!
                const result = raceResult.result;

                // Capture sandbox ID from result for potential continuation or cleanup
                if (
                  result &&
                  typeof result === "object" &&
                  "sandboxId" in result
                ) {
                  sandboxId = result.sandboxId as string;
                }

                if (
                  !result ||
                  typeof result !== "object" ||
                  typeof result.videoPath !== "string"
                ) {
                  throw new Error(
                    "Render step did not produce a valid video result"
                  );
                }

                const videoDataUrl = result.videoPath;
                if (typeof videoDataUrl !== "string" || !videoDataUrl.length) {
                  throw new Error(
                    "Render step did not return a usable video data URL"
                  );
                }
                if (!videoDataUrl.startsWith("data:video/mp4;base64,")) {
                  throw new Error(
                    "Render step returned video data in an unexpected format"
                  );
                }

                await updateJobProgress(jobId, {
                  progress: 88,
                  step: "Saving video",
                  details: "Uploading",
                });

                const uploadUrl = await uploadVideo({
                  videoPath: videoDataUrl,
                  userId,
                });

                console.log(" Video uploaded to storage", {
                  uploadUrl,
                  renderAttempt: attempt,
                  pollIteration,
                });

                if (typeof uploadUrl !== "string" || !uploadUrl.length) {
                  throw new Error("Upload step did not return a valid URL");
                }

                await updateJobProgress(jobId, {
                  progress: 90,
                  step: "Video saved",
                  details: "Done",
                });

                return {
                  continue: false,
                  uploadUrl,
                  warnings: result.warnings ?? [],
                  logs: pruneRenderLogs(result.logs),
                } satisfies RenderAttemptSuccess & { continue: boolean };
              } catch (err) {
                const base =
                  err instanceof Error ? err : new Error(String(err));
                throw new NonRetriableError(base.message, { cause: base });
              }
            });

            // Check if we should continue or if render completed
            if ("continue" in pollResult && pollResult.continue) {
              // Extract sandboxId if present in the result
              if (
                "sandboxId" in pollResult &&
                typeof pollResult.sandboxId === "string"
              ) {
                sandboxId = pollResult.sandboxId;
              }
              // Continue to next poll iteration
              console.log(
                `Continuing render in next step iteration ${
                  pollIteration + 1
                } with sandbox ${sandboxId ?? "(new)"}`
              );
              continue;
            }

            // Render completed successfully
            renderExecution = pollResult as RenderAttemptSuccess;
            break;
          }

          if (!renderExecution) {
            // Cleanup sandbox on max iterations
            if (sandboxId) {
              try {
                console.log(
                  `Cleaning up sandbox ${sandboxId} after max iterations`
                );
                const sandbox = await Sandbox.connect(sandboxId);
                await sandbox.kill();
                console.log(`Sandbox ${sandboxId} cleaned up successfully`);
              } catch (cleanupErr) {
                console.warn(
                  `Failed to cleanup sandbox ${sandboxId}:`,
                  cleanupErr
                );
              }
            }
            throw new Error(
              `Render exceeded maximum poll iterations (${MAX_POLL_ITERATIONS})`
            );
          }

          const renderWarnings = renderExecution.warnings ?? [];
          const renderLogs = renderExecution.logs ?? [];
          const uploadUrl = renderExecution.uploadUrl;

          renderOutcome = {
            uploadUrl,
            warnings: renderWarnings,
            logs: renderLogs,
          } satisfies RenderAttemptSuccess;

          if (renderOutcome.warnings.length) {
            pipelineWarnings.push(...renderOutcome.warnings);
          }

          const attemptDurationMs = Date.now() - attemptStart;
          renderAttempts = attempt;
          console.log(` Render attempt ${attempt} succeeded`, {
            durationMs: attemptDurationMs,
            warnings: renderOutcome.warnings.length,
          });

          // Cleanup sandbox after successful render
          if (sandboxId) {
            try {
              console.log(
                `Cleaning up sandbox ${sandboxId} after successful render`
              );
              const sandbox = await Sandbox.connect(sandboxId);
              await sandbox.kill();
              console.log(`Sandbox ${sandboxId} cleaned up successfully`);
            } catch (cleanupErr) {
              console.warn(
                `Failed to cleanup sandbox ${sandboxId}:`,
                cleanupErr
              );
            }
          }
          break;
        } catch (error: unknown) {
          const cause =
            error instanceof NonRetriableError && error.cause
              ? error.cause
              : error;
          const baseError =
            cause instanceof Error ? cause : new Error(String(cause));
          const renderError = baseError as RenderProcessError;

          const rawMessage = (renderError.message || "").trim();
          const normalizedMessage = rawMessage.length
            ? rawMessage
            : String(error || "").trim() || "Unknown error";
          const stack = renderError.stack;
          const stderr = renderError.stderr;
          const stdout = renderError.stdout;
          const exitCode = renderError.exitCode;
          const logs = renderError.logs ?? [];

          const sanitizedErrorDetails = {
            message: normalizedMessage,
            stack: clampDetail(stack),
            stderr: clampDetail(stderr),
            stdout: clampDetail(stdout),
            exitCode,
            stage: renderError.stage,
            hint: renderError.hint,
            logs: logs.length ? logs.slice(-50) : undefined,
          } satisfies ManimGenerationErrorDetails;

          failedAttempts.push({
            attemptNumber: attempt,
            script: currentScript,
            error: sanitizedErrorDetails,
          });
          if (failedAttempts.length > ATTEMPT_HISTORY_LIMIT) {
            failedAttempts.splice(
              0,
              failedAttempts.length - ATTEMPT_HISTORY_LIMIT
            );
          }

          console.error(` Render attempt ${attempt} failed`, {
            message: normalizedMessage,
            stage: renderError.stage,
            exitCode,
            hint: renderError.hint,
          });

          await updateJobProgress(jobId, {
            progress: 66,
            step: `Retrying render`,
            details: "Retrying render attempt",
          });

          if (attempt === MAX_RENDER_RETRIES) {
            throw renderError;
          }

          // Skip retry with same script - go directly to regenerating a new script
          console.log(
            ` Skipping render retry, regenerating script for attempt ${
              attempt + 1
            }`
          );

          const repeatedErrorOccurrences = Math.max(
            1,
            failedAttempts.filter((attemptRecord) => {
              const message = attemptRecord.error.message?.trim();
              return message && message === normalizedMessage;
            }).length
          );

          let previousScriptForRewrite = currentScript;
          let acceptedNewScript = false;
          let repeatedCount = repeatedErrorOccurrences;

          for (
            let regenPass = 1;
            regenPass <= MAX_FORCE_REGENERATIONS;
            regenPass++
          ) {
            const isForcedRewrite = regenPass > 1;
            const regenStepParts: Array<string | number> = [
              "video",
              isForcedRewrite ? "force-regen" : "regen",
              attempt + 1,
              "cycle",
              regenPass,
            ];

            console.log(
              ` Regeneration pass ${regenPass} (${
                isForcedRewrite ? "forced" : "standard"
              }) after render attempt ${attempt}`
            );

            const regeneratedScript = await step.run(
              buildStepId(...regenStepParts),
              async () => {
                const nextScript = await regenerateManimScriptWithError({
                  prompt: generationPrompt,
                  voiceoverScript,
                  previousScript: previousScriptForRewrite,
                  error: normalizedMessage,
                  errorDetails: sanitizedErrorDetails,
                  attemptNumber: attempt,
                  attemptHistory: failedAttempts,
                  blockedScripts: Array.from(blockedScripts.values()),
                  forceRewrite: isForcedRewrite,
                  forcedReason: isForcedRewrite
                    ? "Regenerated script matched a previous failure and must be rewritten with substantial changes."
                    : undefined,
                  repeatedErrorCount: repeatedCount,
                });
                const trimmed = nextScript.trim();
                if (!trimmed) {
                  throw new Error(
                    `Regeneration returned an empty script for render attempt ${
                      attempt + 1
                    } (pass ${regenPass})`
                  );
                }
                return trimmed;
              }
            );

            const verificationContext = isForcedRewrite
              ? `full video forced regeneration pass ${regenPass}`
              : `full video regeneration`;

            const verifiedScript = await verifyScriptWithAutoFix({
              scriptToCheck: regeneratedScript,
              context: verificationContext,
              narration: voiceoverScript,
              stepBaseParts: [
                "video",
                "verify",
                isForcedRewrite ? "force" : "retry",
                attempt + 1,
                "cycle",
                regenPass,
              ],
              jobId,
              progressFloor: Math.min(70, 60 + attempt * 2),
            });

            const fingerprint = fingerprintScript(verifiedScript);
            if (!blockedScripts.has(fingerprint)) {
              blockedScripts.set(fingerprint, verifiedScript.trim());
              currentScript = verifiedScript;
              console.log(
                ` Accepted regenerated script on pass ${regenPass} for render attempt ${
                  attempt + 1
                }`
              );
              acceptedNewScript = true;
              break;
            }

            console.warn(
              " Regeneration produced a previously blocked script; continuing"
            );
            previousScriptForRewrite = verifiedScript;
            blockedScripts.set(fingerprint, verifiedScript.trim());
            repeatedCount += 1;

            if (regenPass === MAX_FORCE_REGENERATIONS) {
              throw new Error(
                "Regeneration could not produce a new script after multiple passes"
              );
            }
          }

          if (!acceptedNewScript) {
            throw new Error(
              "Failed to produce a new script after regeneration attempts"
            );
          }
        }
      }

      if (!renderOutcome) {
        throw new Error("Render pipeline exited without producing a video");
      }

      const uploadUrl = renderOutcome.uploadUrl;
      const renderLogs = Array.isArray(renderOutcome.logs)
        ? renderOutcome.logs
        : [];

      if (pipelineWarnings.length) {
        await updateJobProgress(jobId, {
          progress: 91,
          step: "Render complete",
          details: "Processing",
        });
      }

      if (jobId) {
        await updateJobProgress(jobId, {
          progress: 95,
          step: "Finishing up",
          details: "Wrapping up",
        });
        await jobStore.setReady(jobId, uploadUrl);
        await jobStore.setYoutubeStatus(jobId, { youtubeStatus: "pending" });
      }

      const totalRenderAttempts = renderAttempts || 1;

      const segmentResults = [
        {
          id: "full-video",
          title: variant === "short" ? "Vertical Short" : "Full Video",
          attempts: totalRenderAttempts,
          warnings: pipelineWarnings,
          logs: renderLogs,
          success: true,
        },
      ];

      const {
        title: generatedYoutubeTitle,
        description: generatedYoutubeDescription,
      } = await step.run(buildStepId("youtube", "metadata"), async () => {
        const metadataPrompt = prompt ?? "";
        const narration = voiceoverScript ?? "";

        let aiTitle: string | undefined;
        let aiDescription: string | undefined;

        try {
          const titleText = await generateYoutubeTitle({
            prompt: metadataPrompt,
            voiceoverScript: narration,
          });
          const trimmedTitle = titleText.trim();
          aiTitle = trimmedTitle.length ? trimmedTitle : undefined;
        } catch (error) {
          console.warn("Failed to generate AI YouTube title:", error);
        }

        try {
          const descriptionText = await generateYoutubeDescription({
            prompt: metadataPrompt,
            voiceoverScript: narration,
          });
          const trimmedDescription = descriptionText.trim();
          aiDescription = trimmedDescription.length
            ? trimmedDescription
            : undefined;
        } catch (error) {
          console.warn("Failed to generate AI YouTube description:", error);
        }

        return {
          title: aiTitle,
          description: aiDescription,
        };
      });

      const ytTitle =
        generatedYoutubeTitle ?? buildYouTubeTitle({ prompt, voiceoverScript });
      const ytDescription =
        generatedYoutubeDescription ??
        buildYouTubeDescription({
          prompt,
          voiceoverScript,
        });
      await step.sendEvent("dispatch-youtube-upload", {
        name: "video/youtube.upload.request",
        data: {
          videoUrl: uploadUrl,
          title: ytTitle,
          description: ytDescription,
          prompt: prompt,
          voiceoverScript: voiceoverScript,
          jobId,
          userId,
          variant,
        },
      });

      return {
        success: true,
        videoUrl: uploadUrl,
        prompt,
        userId,
        chatId,
        generatedAt: new Date().toISOString(),
        voiceoverLength: voiceoverScript.length,
        renderAttempts: totalRenderAttempts,
        retriedAfterError: totalRenderAttempts > 1,
        segments: segmentResults,
        warnings: pipelineWarnings,
      };
    } catch (err: unknown) {
      const { message: jobErrorMessage, detail } = formatJobError(err);
      console.error(
        "Error in generateVideo function (internal details hidden from UI):",
        err
      );
      if (jobId) {
        await updateJobProgress(jobId, {
          step: "error",
          details: detail,
        });
        await jobStore.setError(jobId, jobErrorMessage);
      }
      throw err;
    }
  }
);

export const uploadVideoToYouTube = inngest.createFunction(
  { id: "upload-video-to-youtube", timeouts: { start: "20m", finish: "45m" } },
  { event: "video/youtube.upload.request" },
  async ({ event, step }) => {
    const {
      videoUrl,
      title,
      prompt,
      description,
      jobId,
      voiceoverScript,
      variant,
    } = event.data as {
      videoUrl: string;
      title: string;
      prompt: string;
      description?: string;
      jobId?: string;
      voiceoverScript?: string;
      variant?: VideoVariant;
    };

    const isShort = variant === "short";
    const tags = [
      "education",
      "manim",
      "math",
      "science",
      ...(isShort ? ["shorts", "vertical"] : []),
    ];

    try {
      let thumbnailDataUrl: string | undefined;

      const yt = await step.run("upload-to-youtube", async () => {
        return await uploadToYouTube({
          videoUrl,
          prompt,
          title,
          description,
          voiceoverScript: voiceoverScript,
          tags,
          variant,
          thumbnailDataUrl,
        });
      });

      await step.sendEvent("dispatch-x-upload", {
        name: "video/x.upload.request",
        data: {
          videoUrl: yt.watchUrl,
          title: yt.title,
        },
      });

      if (jobId) {
        await jobStore.setYoutubeStatus(jobId, {
          youtubeStatus: "uploaded",
          youtubeUrl: yt.watchUrl,
          youtubeVideoId: yt.videoId,
          youtubeError: undefined,
        });
      }

      return { success: true, ...yt };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await step.run("log-youtube-failure", async () => {
        console.error("YouTube upload failed", errorMessage);
      });
      if (jobId) {
        await jobStore.setYoutubeStatus(jobId, {
          youtubeStatus: "failed",
          youtubeUrl: undefined,
          youtubeVideoId: undefined,
          youtubeError: errorMessage,
        });
      }
      throw err;
    }
  }
);

export const uploadVideoToX = inngest.createFunction(
  { id: "upload-video-to-x", timeouts: { start: "20m", finish: "45m" } },
  { event: "video/x.upload.request" },
  async ({ event, step }) => {
    const { videoUrl, title } = event.data as {
      videoUrl: string;
      title: string;
    };

    await step.run("upload-to-x", async () => {
      const twitterClient = new TwitterApi({
        appKey: process.env.X_API_KEY!,
        appSecret: process.env.X_API_KEY_SECRET!,
        accessToken: process.env.X_ACCESS_TOKEN!,
        accessSecret: process.env.X_ACCESS_TOKEN_SECRET!,
      });

      await twitterClient.v2.tweet({
        text: `${title} \n \n \n Generated for free at https://eduvids.vercel.app ${videoUrl}`,
      });
    });
  }
);
