import { MANIM_SYSTEM_PROMPT, VOICEOVER_SYSTEM_PROMPT } from "@/prompt";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import fs from "fs";
import path from "path";

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY!,
});

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
    prompt: `User request: ${prompt}\n\nVoiceover narration:\n${voiceoverScript}\n. Generate the complete Manim script that follows the narration:`,
  });

  // Extract code from potential markdown formatting
  const code = firstAttempt.text
    .replace(/```python?\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  return code;
}

export async function generateYoutubeTitle({
  prompt,
  voiceoverScript,
}: ManimScriptRequest) {
  const model = google("gemini-2.5-flash");

  const systemPrompt =
    "You are a helpful assistant that generates catchy YouTube titles for educational videos based on the content provided. REMEMBER TO KEEP IT SHORT AND ENGAGING. ONLY PROVIDE THE TITLE, NOTHING ELSE.";
  const { text } = await generateText({
    model,
    system: systemPrompt,
    prompt: `User request: ${prompt}\n\nVoiceover narration:\n${voiceoverScript}\n\nGenerate a catchy YouTube title for the video that summarizes the content:`,
  });

  return text.trim();
}

export async function generateYoutubeDescription({
  prompt,
  voiceoverScript,
}: ManimScriptRequest) {
  const model = google("gemini-2.5-flash");

  const systemPrompt =
    "You are a helpful assistant that generates cool YouTube descriptions for educational videos based on the content provided. REMEMBER TO KEEP IT SHORT AND ENGAGING. ONLY PROVIDE THE DESCRIPTION, NOTHING ELSE.";
  const { text } = await generateText({
    model,
    system: systemPrompt,
    prompt: `User request: ${prompt}\n\nVoiceover narration:\n${voiceoverScript}\n\nGenerate the YouTube description for the video that summarizes the content:`,
  });

  return text.trim();
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
        blockedScripts
          .map((script) => {
            const trimmed = script.trim();
            return [trimmed, truncate(trimmed, 6000)];
          })
      ).values()
    );
    if (!unique.length) return "";
    const blocks = unique
      .map((script, idx) => `--- Failed Script Variant #${idx + 1} ---\n${script}`)
      .join("\n\n");
    return `\nThe following script variants are known to fail. You must not reuse them verbatim or with superficial edits. Study them to understand and avoid the mistakes:\n${blocks}\n`;
  })();

  const rewriteDirective = forceRewrite
    ? `\nThis is a forced rewrite because the last regeneration did not resolve the issue. ${
        forcedReason ?? "Produce a substantially different script that fixes the problem."
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
      "1. Missing required imports (VoiceoverScene, GTTSService, etc.) or missing self.set_speech_service(GTTSService()).",
      "2. Using self.camera.frame or assigning frame = self.camera.frame (or accessing frame.width/frame.height) inside VoiceoverScene without MovingCameraScene.",
      "3. Shadowing Python built-ins (str=, list=, dict=, int=, float=, len=, max=, min=, sum=, all=, any=) or calling string literals like 'text'().",
      "4. Text layouts that will obviously fail (e.g., a single Text wider than ~13 units) or titles overlapping content with no spacing.",
      "5. Any syntax errors or omissions that would prevent the scene from running.",
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
        if (candidate[i] === '\\') {
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
      if (terminator === "," || terminator === "}" || terminator === undefined) {
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
