import { inngest } from "./inngest";
import {
  generateManimScript,
  generateVoiceoverScript,
  regenerateManimScriptWithError,
  verifyManimScript,
} from "./gemini";
import type {
  ManimGenerationAttempt,
  ManimGenerationErrorDetails,
  VerifyManimScriptResult,
} from "./gemini";
import { renderManimVideo, ValidationStage } from "./e2b";
import type { RenderLogEntry } from "./e2b";
import { VOICEOVER_SERVICE_IMPORT, VOICEOVER_SERVICE_SETTER } from "@/prompt";
import { uploadVideo } from "./uploadthing";
import { jobStore, type VideoVariant } from "./job-store";
import { uploadToYouTube } from "./youtube";

type RenderProcessError = Error & {
  stderr?: string;
  stdout?: string;
  exitCode?: number;
  stage?: ValidationStage;
  hint?: string;
  logs?: RenderLogEntry[];
};

type RenderAttemptSuccess = {
  uploadUrl: string;
  warnings: Array<{ stage: ValidationStage; message: string }>;
  logs: RenderLogEntry[];
};

type HeuristicSeverity = "noncode" | "fixable" | "critical";
type HeuristicIssue = { message: string; severity: HeuristicSeverity };
type HeuristicOptions = { allowVerificationFixes?: boolean };

const MAX_RENDER_LOG_ENTRIES = 200;

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
  const baseMessage =
    error instanceof Error
      ? error.message
      : typeof error === "string"
      ? error
      : "Unknown error";

  if (!error || typeof error !== "object") {
    return { message: baseMessage };
  }

  const stage = (error as Partial<RenderProcessError>).stage;
  const hint = (error as Partial<RenderProcessError>).hint;
  const exitCode = (error as Partial<RenderProcessError>).exitCode;
  const stderr = clampDetail((error as Partial<RenderProcessError>).stderr);
  const stdout = clampDetail((error as Partial<RenderProcessError>).stdout);
  const logs = (error as Partial<RenderProcessError>).logs;

  const messageExtras: string[] = [];
  if (stage) messageExtras.push(`stage: ${stage}`);
  if (typeof exitCode === "number") messageExtras.push(`exit: ${exitCode}`);
  if (hint) messageExtras.push(`hint: ${hint}`);

  const message = messageExtras.length
    ? `${baseMessage} (${messageExtras.join(", ")})`
    : baseMessage;

  const detailParts: string[] = [];
  if (stderr) detailParts.push(`stderr: ${stderr}`);
  else if (stdout) detailParts.push(`stdout: ${stdout}`);
  if (logs && logs.length) {
    const clipped = logs
      .slice(-10)
      .map((entry) => `[${entry.level}] ${entry.message}`)
      .join(" | ");
    if (clipped) {
      detailParts.push(`logs: ${clipped}`);
    }
  }

  return {
    message,
    detail: detailParts.length ? detailParts.join(" | ") : undefined,
  };
};

// Quick pre-check for absolutely required elements (fast fail)
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

  const FONT_SIZE_PATTERN = /font_size\s*=\s*([0-9]+(?:\.[0-9]+)?)/g;
  const ALLOWED_FONT_SIZES = [20, 22, 24, 26, 28, 30, 32, 34, 36, 38, 40, 46];
  const TEXT_CONSTRUCTOR_PATTERN =
    /\b(Text|MathTex|Tex|TexText|MarkupText|Paragraph)\s*\(/g;
  const missingFontSizeConstructors = new Set<string>();
  const scanConstructorsForFontSize = () => {
    TEXT_CONSTRUCTOR_PATTERN.lastIndex = 0;
    let constructorMatch: RegExpExecArray | null;
    while ((constructorMatch = TEXT_CONSTRUCTOR_PATTERN.exec(normalized)) !== null) {
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

  const SCALE_TO_FIT_WIDTH_PATTERN = /\.scale_to_fit_width\(\s*([0-9]+(?:\.[0-9]+)?)\s*(?:[,)]|$)/g;
  let scaleToFitMatch: RegExpExecArray | null;
  while ((scaleToFitMatch = SCALE_TO_FIT_WIDTH_PATTERN.exec(normalized)) !== null) {
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

export const generateVideo = inngest.createFunction(
  {
    id: "generate-manim-video",
    timeouts: { start: "25m", finish: "90m" },
    retries: 1, // Allow 1 additional retry at the function level
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
    }: {
      scriptToCheck: string;
      context: string;
      narration: string;
      stepBaseParts: ReadonlyArray<string | number | undefined>;
    }): Promise<string> => {
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

        const result = await step.run(
          buildStepId(...baseStepParts, "pass", pass),
          async () => {
            const trimmedCurrent = current.trim();
            const preCheck = runHeuristicChecks(trimmedCurrent, {
              allowVerificationFixes: true,
            });

            if (!preCheck.ok) {
              return {
                ok: false,
                error: preCheck.error,
              } satisfies VerifyManimScriptResult;
            }

            const verification = await verifyManimScript({
              prompt,
              voiceoverScript: narration,
              script: trimmedCurrent,
            });

            if (!verification.ok) {
              return verification;
            }

            const candidate = (
              verification.fixedScript ?? trimmedCurrent
            ).trim();
            const postCheck = runHeuristicChecks(candidate);

            if (!postCheck.ok) {
              return {
                ok: false,
                error: postCheck.error,
                fixedScript: candidate,
              } satisfies VerifyManimScriptResult;
            }

            return {
              ok: true,
              fixedScript: candidate,
            } satisfies VerifyManimScriptResult;
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

          return approvedScript;
        }

        lastError = result.error;

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
      await jobStore.setProgress(jobId!, {
        progress: 5,
        step: "generating voiceover",
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

      await jobStore.setProgress(jobId!, {
        progress: 20,
        step: "generating script",
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
      });

      console.log(" Manim script verified", {
        length: script.length,
      });

      await jobStore.setProgress(jobId!, {
        progress: 35,
        step: "validated script",
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
          const stepResult = await step.run(
            buildStepId("video", "render", "attempt", attempt),
            async () => {
              const result = await renderManimVideo({
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
              });

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
              if (!videoDataUrl.startsWith("data:video/mp4;base64,")) {
                throw new Error(
                  "Render step returned video data in an unexpected format"
                );
              }

              if (jobId) {
                await jobStore.setProgress(jobId, {
                  progress: 72,
                  step: "rendered video",
                });
                await jobStore.setProgress(jobId, {
                  progress: 80,
                  step: "uploading video",
                });
              }

              const uploadUrl = await uploadVideo({
                videoPath: videoDataUrl,
                userId,
              });

              console.log(" Video uploaded to storage", {
                uploadUrl,
                renderAttempt: attempt,
              });

              return {
                uploadUrl,
                warnings: result.warnings ?? [],
                logs: pruneRenderLogs(result.logs),
              } satisfies RenderAttemptSuccess;
            }
          );

          if (
            !stepResult ||
            typeof stepResult.uploadUrl !== "string" ||
            !stepResult.uploadUrl.length
          ) {
            console.error(" Render step did not return an upload URL", {
              result: stepResult,
            });
            throw new Error("Render pipeline did not produce an upload URL");
          }

          const renderWarnings = stepResult.warnings ?? [];
          const renderLogs = stepResult.logs ?? [];

          renderOutcome = {
            uploadUrl: stepResult.uploadUrl,
            warnings: renderWarnings,
            logs: renderLogs,
          };

          if (renderOutcome.warnings.length) {
            pipelineWarnings.push(...renderOutcome.warnings);
          }

          const attemptDurationMs = Date.now() - attemptStart;
          renderAttempts = attempt;
          console.log(` Render attempt ${attempt} succeeded`, {
            durationMs: attemptDurationMs,
            warnings: renderOutcome.warnings.length,
          });
          break;
        } catch (error: unknown) {
          const baseError =
            error instanceof Error ? error : new Error(String(error));
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

          await jobStore.setProgress(jobId!, {
            details: `render attempt ${attempt}: ${normalizedMessage}`,
          });

          if (attempt === MAX_RENDER_RETRIES) {
            throw renderError;
          }

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

      if (jobId) {
        await jobStore.setProgress(jobId, {
          progress: 82,
          step: "uploaded video",
        });
      }

      if (pipelineWarnings.length) {
        await jobStore.setProgress(jobId!, {
          details: pipelineWarnings
            .map((warning) => `[${warning.stage}] ${warning.message}`)
            .join(" | "),
        });
      }

      if (jobId) {
        await jobStore.setProgress(jobId, { progress: 95, step: "finalizing" });
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

      const ytTitle = buildYouTubeTitle({ prompt, voiceoverScript });
      await step.sendEvent("dispatch-youtube-upload", {
        name: "video/youtube.upload.request",
        data: {
          videoUrl: uploadUrl,
          title: ytTitle,
          description: `${prompt}`,
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
      console.error("Error in generateVideo function:", jobErrorMessage, err);
      if (jobId) {
        try {
          await jobStore.setProgress(jobId, {
            step: "error",
            details: detail,
          });
        } catch (progressError) {
          console.warn("Failed to record error progress", progressError);
        }
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
    const { videoUrl, title, description, jobId, voiceoverScript, variant } =
      event.data as {
        videoUrl: string;
        title: string;
        description?: string;
        jobId?: string;
        voiceoverScript?: string;
        variant?: VideoVariant;
      };

    const isShprt = variant === "short";
    const tags = [
      "education",
      "manim",
      "math",
      "science",
      ...(isShprt ? ["shorts", "vertical"] : []),
    ];

    try {
      const yt = await step.run("upload-to-youtube", async () => {
        return await uploadToYouTube({
          videoUrl,
          prompt: title,
          description,
          voiceoverScript: voiceoverScript,
          tags,
          variant,
        });
      });

      await step.run("log-youtube-success", async () => {
        console.log("YouTube upload complete", yt);
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
