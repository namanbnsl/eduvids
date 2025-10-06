import { inngest } from "./inngest";
import {
  generateSegmentManimScript,
  generateVoiceoverScript,
  planManimSegments,
  regenerateManimScriptWithError,
  verifyManimScript,
} from "./gemini";
import type {
  ManimGenerationAttempt,
  ManimGenerationErrorDetails,
  PlannedManimSegment,
  VerifyManimScriptResult,
} from "./gemini";
import { concatSegmentVideos, renderManimVideo, ValidationStage } from "./e2b";
import { uploadVideo } from "./uploadthing";
import { jobStore } from "./job-store";
import { uploadToYouTube } from "./youtube";

type RenderProcessError = Error & {
  stderr?: string;
  stdout?: string;
  exitCode?: number;
  stage?: ValidationStage;
  hint?: string;
};

type HeuristicSeverity = "noncode" | "fixable" | "critical";
type HeuristicIssue = { message: string; severity: HeuristicSeverity };
type HeuristicOptions = { allowVerificationFixes?: boolean };

const REQUIRED_IMPORTS = [
  "from manim import",
  "from manim_voiceover import VoiceoverScene",
  "from manim_voiceover.services.gtts import GTTSService",
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

// const STRING_CALL_PATTERN = /(^|[^a-zA-Z0-9_])(['"][^'"]*['"])\s*\(/;
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

// Quick pre-check for absolutely required elements (fast fail)
function validateRequiredElements(script: string): { ok: boolean; error?: string } {
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
    issues.push("Missing self.set_speech_service(GTTSService()) call");
  }

  if (issues.length > 0) {
    return {
      ok: false,
      error: `Script validation failed - missing required elements:\n${issues.map((issue, idx) => `${idx + 1}. ${issue}`).join("\n")}`,
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
      message:
        "❌ VoiceoverScene requires self.set_speech_service(GTTSService()).",
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
    timeouts: { start: "15m", finish: "45m" },
    retries: 1, // Allow 1 additional retry at the function level
  },
  { event: "video/generate.request" },
  async ({ event, step }) => {
    const { prompt, userId, chatId, jobId } = event.data as {
      prompt: string;
      userId: string;
      chatId: string;
      jobId?: string;
    };

    console.log(`Starting video generation for prompt: "${prompt}"`);

    const sanitizeForStep = (label: string) => {
      const normalized = label
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
      return normalized.length ? normalized : "verification";
    };

    const verifyScriptWithAutoFix = async ({
      scriptToCheck,
      context,
      narration,
    }: {
      scriptToCheck: string;
      context: string;
      narration: string;
    }): Promise<string> => {
      const MAX_VERIFY_PASSES = 1;
      const limitHistory = <T>(history: T[], max: number) => {
        if (history.length <= max) return;
        history.splice(0, history.length - max);
      };
      const baseStepId = sanitizeForStep(context);
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
          `verify-${baseStepId}-pass-${pass}`,
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
            `regen-${baseStepId}-pass-${pass}`,
            async () => {
              const regenerated = await regenerateManimScriptWithError({
                prompt,
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

    const runWithConcurrency = async <T, R>(
      items: T[],
      limit: number,
      task: (item: T, index: number) => Promise<R>
    ): Promise<R[]> => {
      if (!items.length) return [];
      const maxWorkers = Math.max(1, Math.min(limit, items.length));
      const results: R[] = new Array(items.length);
      let nextIndex = 0;

      const worker = async () => {
        while (nextIndex < items.length) {
          const currentIndex = nextIndex;
          nextIndex += 1;
          results[currentIndex] = await task(items[currentIndex]!, currentIndex);
        }
      };

      const workers = Array.from({ length: maxWorkers }, () => worker());
      await Promise.all(workers);
      return results;
    };

    try {
      await jobStore.setProgress(jobId!, {
        progress: 5,
        step: "generating voiceover",
      });
      const voiceoverScript = await step.run(
        "generate-voiceover-script",
        async () => {
          return await generateVoiceoverScript({ prompt });
        }
      );

      console.log("Generated voiceover script", {
        length: voiceoverScript.length,
      });

      await jobStore.setProgress(jobId!, {
        progress: 18,
        step: "planning segments",
      });
      const segments = await step.run("plan-manim-segments", async () => {
        return await planManimSegments({
          prompt,
          voiceoverScript,
        });
      });

      console.log("Planned segments", {
        count: segments.length,
        ids: segments.map((segment) => segment.id),
      });

      await jobStore.setProgress(jobId!, {
        progress: 32,
        step: "preparing segments",
      });

      const SEGMENT_RENDER_CONCURRENCY = Math.min(segments.length, 3);
      const MAX_SEGMENT_RENDER_RETRIES = 3;
      const MAX_FORCE_REGENERATIONS = 2;
      const ATTEMPT_HISTORY_LIMIT = 3;

      const segmentWarnings: Array<{ stage: ValidationStage; message: string }> = [];

      const clampDetail = (value?: string, limit = 2000) => {
        if (!value) return undefined;
        return value.length > limit ? value.slice(0, limit) : value;
      };

      let completedSegments = 0;
      const updateProgressAfterSegment = async (segmentTitle: string) => {
        completedSegments += 1;
        const ratio = completedSegments / segments.length;
        const progressValue = Math.round(40 + ratio * 30);
        await jobStore.setProgress(jobId!, {
          progress: Math.min(progressValue, 72),
          step: `rendered segment ${completedSegments}/${segments.length}`,
          details: segmentTitle,
        });
      };

      type SegmentOutput = {
        segmentId: string;
        title: string;
        videoDataUrl: string;
        warnings: Array<{ stage: ValidationStage; message: string }>;
        renderAttempts: number;
      };

      const processSegment = async (
        segment: PlannedManimSegment,
        index: number
      ): Promise<SegmentOutput> => {
        const baseId = sanitizeForStep(`segment-${index + 1}-${segment.id}`);
        let script = await step.run(
          `segment-${baseId}-generate-script`,
          async () => {
            return await generateSegmentManimScript({
              prompt,
              voiceoverScript,
              segment,
            });
          }
        );

        console.log(`Generated script for segment ${segment.id}`, {
          length: script.length,
        });

        const preValidation = validateRequiredElements(script);
        if (!preValidation.ok) {
          throw new Error(
            `Segment ${segment.id} failed pre-validation: ${preValidation.error}`
          );
        }

        script = await verifyScriptWithAutoFix({
          scriptToCheck: script,
          context: `segment ${index + 1}: ${segment.title}`,
          narration: segment.narration,
        });

        console.log(`Verified script for segment ${segment.id}`, {
          length: script.length,
        });

        let currentScript = script;
        const segmentRenderWarnings: Array<{
          stage: ValidationStage;
          message: string;
        }> = [];
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

        for (let attempt = 1; attempt <= MAX_SEGMENT_RENDER_RETRIES; attempt++) {
          try {
            const { videoPath, warnings } = await step.run(
              `segment-${baseId}-render-${attempt}`,
              async () => {
                return await renderManimVideo({
                  script: currentScript,
                  prompt: `${prompt} (segment ${segment.title})`,
                  applyWatermark: false,
                });
              }
            );

            if (warnings.length) {
              segmentRenderWarnings.push(...warnings);
            }

            await updateProgressAfterSegment(segment.title);

            return {
              segmentId: segment.id,
              title: segment.title,
              videoDataUrl: videoPath,
              warnings: segmentRenderWarnings,
              renderAttempts: attempt,
            };
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

            const sanitizedErrorDetails = {
              message: normalizedMessage,
              stack: clampDetail(stack),
              stderr: clampDetail(stderr),
              stdout: clampDetail(stdout),
              exitCode,
              stage: renderError.stage,
              hint: renderError.hint,
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

            console.error(
              `Segment ${segment.id} render attempt ${attempt} failed:`,
              normalizedMessage
            );

            await jobStore.setProgress(jobId!, {
              details: `segment ${index + 1}/${segments.length}: ${normalizedMessage}`,
            });

            if (attempt === MAX_SEGMENT_RENDER_RETRIES) {
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
              const regenStepId = isForcedRewrite
                ? `segment-${baseId}-force-regen-${attempt + 1}-pass-${regenPass}`
                : `segment-${baseId}-regen-${attempt + 1}`;

              const regeneratedScript = await step.run(
                regenStepId,
                async () => {
                  const nextScript = await regenerateManimScriptWithError({
                    prompt,
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
                      `Regeneration returned an empty script for segment ${segment.id} attempt ${
                        attempt + 1
                      } (pass ${regenPass})`
                    );
                  }
                  return trimmed;
                }
              );

              const verificationContext = isForcedRewrite
                ? `segment ${index + 1} forced regeneration pass ${regenPass}`
                : `segment ${index + 1} regeneration`;

              const verifiedScript = await verifyScriptWithAutoFix({
                scriptToCheck: regeneratedScript,
                context: verificationContext,
                narration: segment.narration,
              });

              const fingerprint = fingerprintScript(verifiedScript);
              if (!blockedScripts.has(fingerprint)) {
                blockedScripts.set(fingerprint, verifiedScript.trim());
                currentScript = verifiedScript;
                acceptedNewScript = true;
                break;
              }

              previousScriptForRewrite = verifiedScript;
              blockedScripts.set(fingerprint, verifiedScript.trim());
              repeatedCount += 1;

              if (regenPass === MAX_FORCE_REGENERATIONS) {
                throw new Error(
                  `Regeneration could not produce a new script for segment ${segment.id} after ${MAX_FORCE_REGENERATIONS} passes`
                );
              }
            }

            if (!acceptedNewScript) {
              throw new Error(
                `Failed to produce a new script for segment ${segment.id} after regeneration attempts`
              );
            }
          }
        }

        throw new Error(
          `Segment ${segment.id} could not be rendered after ${MAX_SEGMENT_RENDER_RETRIES} attempts`
        );
      };

      const segmentOutputs = await runWithConcurrency(
        segments,
        SEGMENT_RENDER_CONCURRENCY,
        processSegment
      );

      segmentOutputs.forEach((output) => {
        if (output.warnings.length) {
          segmentWarnings.push(...output.warnings);
        }
      });

      await jobStore.setProgress(jobId!, {
        progress: 75,
        step: "concatenating segments",
      });

      const { uploadUrl, warnings: finalWarnings = [] } = await step.run(
        "concat-watermark-and-upload",
        async () => {
          const concatResult = await concatSegmentVideos({
            segments: segmentOutputs.map((output) => ({
              id: output.segmentId,
              dataUrl: output.videoDataUrl,
            })),
          });

          const uploadedUrl = await uploadVideo({
            videoPath: concatResult.videoPath,
            userId,
          });

          return {
            uploadUrl: uploadedUrl,
            warnings: concatResult.warnings,
          };
        }
      );

      if (finalWarnings.length) {
        segmentWarnings.push(...finalWarnings);
      }

      await jobStore.setProgress(jobId!, {
        progress: 82,
        step: "uploaded video",
      });

      const videoUrl = uploadUrl;

      if (segmentWarnings.length) {
        await jobStore.setProgress(jobId!, {
          details: segmentWarnings
            .map((warning) => `[${warning.stage}] ${warning.message}`)
            .join(" | "),
        });
      }

      const totalRenderAttempts = segmentOutputs.reduce(
        (sum, output) => sum + output.renderAttempts,
        0
      );

      if (jobId) {
        await jobStore.setProgress(jobId, { progress: 95, step: "finalizing" });
        await jobStore.setReady(jobId, videoUrl!);
      }

      // Fire-and-forget YouTube upload after UploadThing is ready
      const ytTitle = buildYouTubeTitle({ prompt, voiceoverScript });
      await step.sendEvent("dispatch-youtube-upload", {
        name: "video/youtube.upload.request",
        data: {
          videoUrl: videoUrl!,
          title: ytTitle,
          description: `Generated by eduvids for: ${prompt}`,
          voiceoverScript: voiceoverScript,
          jobId,
          userId,
        },
      });

      return {
        success: true,
        videoUrl: videoUrl,
        prompt,
        userId,
        chatId,
        generatedAt: new Date().toISOString(),
        voiceoverLength: voiceoverScript.length,
        renderAttempts: totalRenderAttempts,
        retriedAfterError: totalRenderAttempts > segments.length,
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error("Error in generateVideo function:", errorMessage);
      if (jobId) {
        await jobStore.setError(jobId, errorMessage);
      }
      throw err;
    }
  }
);

export const uploadVideoToYouTube = inngest.createFunction(
  { id: "upload-video-to-youtube", timeouts: { start: "15m", finish: "30m" } },
  { event: "video/youtube.upload.request" },
  async ({ event, step }) => {
    const { videoUrl, title, description, jobId, voiceoverScript } =
      event.data as {
        videoUrl: string;
        title: string;
        description?: string;
        jobId?: string;
        voiceoverScript?: string;
      };

    try {
      const yt = await step.run("upload-to-youtube", async () => {
        return await uploadToYouTube({
          videoUrl,
          prompt: title,
          description,
          voiceoverScript: voiceoverScript,
          tags: ["education", "manim", "math", "science"],
        });
      });

      await step.run("log-youtube-success", async () => {
        console.log("YouTube upload complete", yt);
      });

      return { success: true, ...yt };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await step.run("log-youtube-failure", async () => {
        console.error("YouTube upload failed", errorMessage);
      });
      if (jobId) {
      }
      throw err;
    }
  }
);
