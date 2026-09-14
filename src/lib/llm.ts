import { safeError } from "./workflow/errors";
import { withOverloadFallback } from "./workflow/model-fallback";
import {
  MANIM_SYSTEM_PROMPT,
  VOICEOVER_SYSTEM_PROMPT,
  SCENE_PLAN_SYSTEM_PROMPT,
  VOICEOVER_SERVICE_IMPORT_TOKEN,
  VOICEOVER_SERVICE_SETTER_TOKEN,
} from "@/prompt";
import { streamText, LanguageModel } from "ai";
import {
  createGoogleProvider,
  reportSuccess,
  reportError,
} from "./google-provider";
import { queryManimDocs } from "./deepwiki";

import { jsonrepair } from "jsonrepair";
import { franc } from "franc";
import { parseVideoTitleSet, type VideoTitleSet } from "./youtube-metadata";

// @ts-expect-error langs has no types
import langs from "langs";

import { withTracing } from "@posthog/ai";
import { PostHog } from "posthog-node";

interface GoogleModelConfig {
  modelId: string;
  provider: Awaited<ReturnType<typeof createGoogleProvider>>;
}

class RetryableModelOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RetryableModelOutputError";
  }
}

const isDev = process.env.NODE_ENV !== "production";

// Only initialize PostHog in production
const phClient =
  isDev || !process.env.NEXT_PUBLIC_POSTHOG_KEY
    ? null
    : new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
        host: process.env.NEXT_PUBLIC_POSTHOG_HOST!,
      });

// Wrapper that skips tracing in development
function maybeWithTracing<T>(
  model: T,
  options: Parameters<typeof withTracing>[2],
): T {
  if (!phClient) return model;
  return withTracing(model as never, phClient, options) as T;
}

const createGoogleModel = async (
  modelId: string,
): Promise<GoogleModelConfig> => {
  const provider = await createGoogleProvider(modelId);
  return { modelId, provider };
};

export async function streamTextWithTracking<
  T extends Parameters<typeof streamText>[0],
>(
  config: T & { model: LanguageModel },
  googleConfig?: GoogleModelConfig,
): Promise<string> {
  const abortSignal = AbortSignal.any([
    ...(config.abortSignal ? [config.abortSignal] : []),
    AbortSignal.timeout(180_000),
  ]);
  return withOverloadFallback(
    () => streamTextOnceWithTracking({ ...config, abortSignal }, googleConfig),
    googleConfig?.modelId === "gemini-3.8-flash"
      ? async () => {
          console.warn(
            "[Google Provider] Primary response failed; switching to gemini-3.5-flash-lite",
          );
          const fallback = await createGoogleModel("gemini-3.5-flash-lite");
          abortSignal.throwIfAborted();
          return streamTextOnceWithTracking(
            {
              ...config,
              model: fallback.provider(fallback.modelId),
              abortSignal,
            },
            fallback,
          );
        }
      : undefined,
    abortSignal,
  );
}

async function streamTextOnceWithTracking<
  T extends Parameters<typeof streamText>[0],
>(
  config: T & { model: LanguageModel },
  googleConfig?: GoogleModelConfig,
): Promise<string> {
  let streamError: unknown;
  try {
    const result = streamText({
      ...config,
      maxRetries: 0, // Upstash retries in a fresh invocation with a freshly selected key.
      abortSignal: config.abortSignal,
      onError: ({ error }) => {
        streamError = error; // Redact before surfacing.
      },
    });
    const text = await result.text;
    if (streamError) throw streamError;
    const finishReason = await result.finishReason;
    const usage = await result.usage;
    const isEmpty = !text.trim();
    const isTruncated = finishReason === "length";
    const isProviderError = finishReason === "error";
    if (isEmpty || isTruncated || isProviderError) {
      console.warn("[AI generation] Unusable model response", {
        finishReason,
        textCharacters: text.length,
        usage,
      });
      if (googleConfig) {
        await reportSuccess(googleConfig.provider);
      }
      const state = isEmpty ? "empty" : "truncated";
      throw new RetryableModelOutputError(
        `AI response was ${state} (finish reason: ${finishReason}, ${text.length} characters); retry generation`,
      );
    }

    if (googleConfig) {
      await reportSuccess(googleConfig.provider);
    }

    return text;
  } catch (error) {
    const failure = streamError ?? error;
    if (googleConfig && !(failure instanceof RetryableModelOutputError)) {
      await reportError(googleConfig.provider, failure);
    }

    throw new Error(safeError(failure));
  }
}

export async function detectLanguage(text: string): Promise<string> {
  try {
    if (!text || text.trim().length < 3) return "english";

    const sample = text.slice(0, 500);

    // franc returns ISO 639-3 codes like "fra", "hin", "jpn"
    const isoCode = franc(sample);

    if (isoCode === "und") return "english";

    const langData = langs.where("3", isoCode);

    if (!langData) return "english";

    // Return lowercase English language name
    return langData.name.toLowerCase();
  } catch (err) {
    console.error("Language detection failed:", err);
    return "english";
  }
}

function buildAugmentedSystemPrompt(base: string, language?: string): string {
  let modifiedBase = base;

  // If language is not English, comprehensively modify the prompt to allow Text instead of requiring LaTeX
  if (language && language !== "english") {
    const langUpper = language.toUpperCase();

    // 3. Add a prominent section at the beginning about non-English text handling
    const nonEnglishHeader = `
CRITICAL - ${langUpper} LANGUAGE DETECTED
This video is in ${language.toUpperCase()}. IMPORTANT RULES:
1. USE Text() FOR NON-MATHEMATICAL WORDS ONLY (no digits): Text("your text", font="EB Garamond", disable_ligatures=True, font_size=36, color=WHITE)
2. USE MathTex() FOR ALL MATH AND FOR ANY NUMBERS OR DIGITS SHOWN ONSCREEN: MathTex(r"E = mc^2", font_size=44)
3. If a label mixes words and numbers, split into Text() + MathTex() in a VGroup
4. ALWAYS use font="EB Garamond", disable_ligatures=True for consistent typography
5. For bullets in ${language}: Create Text() objects with font="EB Garamond", disable_ligatures=True and arrange them manually
6. Example correct usage:
   title = Text("${
     language === "spanish"
       ? "Título"
       : language === "french"
         ? "Titre"
         : language === "german"
           ? "Titel"
           : "Title"
   }", font="EB Garamond", disable_ligatures=True, font_size=48, color=WHITE)
   body = Text("${
     language === "spanish"
       ? "Contenido"
       : language === "french"
         ? "Contenu"
         : language === "german"
           ? "Inhalt"
           : "Content"
   }", font="EB Garamond", disable_ligatures=True, font_size=36, color=WHITE)
7. LaTeX will NOT work for ${language} characters - it will show garbled text or errors

`;

    modifiedBase = nonEnglishHeader + modifiedBase;
  }

  return `${modifiedBase}\n\n---\n`;
}

function titleCaseLanguage(language: string): string {
  return language
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function gttsLanguageCode(language: string): string {
  const languageData = langs.where("name", titleCaseLanguage(language)) as
    | Record<string, string>
    | undefined;
  return languageData?.["1"] ?? "en";
}

export type VoiceoverProvider = "deepgram-aura-openrouter-gtts" | "gtts";

type VoiceoverServiceSpec = {
  provider: VoiceoverProvider;
  serviceImport: string;
  serviceExpression: string;
};

function resolveVoiceoverService(language: string): VoiceoverServiceSpec {
  const normalizedLanguage = language.trim().toLowerCase();
  if (normalizedLanguage === "english") {
    return {
      provider: "deepgram-aura-openrouter-gtts",
      serviceImport: "from eduvids_tts import EduvidsTTSService",
      serviceExpression: "EduvidsTTSService()",
    };
  }

  return {
    provider: "gtts",
    serviceImport: "from manim_voiceover.services.gtts import GTTSService",
    serviceExpression: `GTTSService(lang=${JSON.stringify(gttsLanguageCode(language))})`,
  };
}

function replaceSpeechServiceCalls(
  script: string,
  serviceExpression: string,
): string {
  const needle = "self.set_speech_service(";
  let result = script;
  let searchFrom = 0;

  while (true) {
    const callStart = result.indexOf(needle, searchFrom);
    if (callStart === -1) return result;

    const openingParen = callStart + needle.length - 1;
    let depth = 0;
    let quote: "'" | '"' | null = null;
    let escaped = false;
    let closingParen = -1;

    for (let index = openingParen; index < result.length; index++) {
      const character = result[index];

      if (quote) {
        if (escaped) {
          escaped = false;
        } else if (character === "\\") {
          escaped = true;
        } else if (character === quote) {
          quote = null;
        }
        continue;
      }

      if (character === "'" || character === '"') {
        quote = character;
      } else if (character === "(") {
        depth += 1;
      } else if (character === ")") {
        depth -= 1;
        if (depth === 0) {
          closingParen = index;
          break;
        }
      }
    }

    if (closingParen === -1) {
      throw new Error("Malformed self.set_speech_service(...) call");
    }

    const replacement = `self.set_speech_service(${serviceExpression})`;
    result =
      result.slice(0, callStart) + replacement + result.slice(closingParen + 1);
    searchFrom = callStart + replacement.length;
  }
}

function indentationWidth(line: string): number {
  const whitespace = line.match(/^[ \t]*/)?.[0] ?? "";
  return [...whitespace].reduce(
    (width, character) => width + (character === "\t" ? 4 : 1),
    0,
  );
}

function voiceoverConstructRanges(lines: string[]): Array<{
  className: string;
  constructLine: number;
  bodyEnd: number;
  bodyIndent: string;
}> {
  const ranges: Array<{
    className: string;
    constructLine: number;
    bodyEnd: number;
    bodyIndent: string;
  }> = [];

  for (let classLine = 0; classLine < lines.length; classLine++) {
    const classMatch = /^([ \t]*)class\s+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*:/.exec(
      lines[classLine],
    );
    if (!classMatch || !/\bVoiceoverScene\b/.test(classMatch[3])) continue;

    const classIndent = indentationWidth(classMatch[1]);
    let classEnd = lines.length;
    for (let index = classLine + 1; index < lines.length; index++) {
      const trimmed = lines[index].trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      if (indentationWidth(lines[index]) <= classIndent) {
        classEnd = index;
        break;
      }
    }

    let constructLine = -1;
    let constructIndent = -1;
    let constructWhitespace = "";
    for (let index = classLine + 1; index < classEnd; index++) {
      const constructMatch =
        /^([ \t]*)def\s+construct\s*\(\s*self\s*\)\s*:/.exec(lines[index]);
      if (!constructMatch) continue;
      constructLine = index;
      constructWhitespace = constructMatch[1];
      constructIndent = indentationWidth(constructWhitespace);
      break;
    }

    if (constructLine === -1) {
      throw new Error(
        `Voiceover scene ${classMatch[2]} has no construct(self) method`,
      );
    }

    let bodyEnd = classEnd;
    let bodyIndent = `${constructWhitespace}    `;
    for (let index = constructLine + 1; index < classEnd; index++) {
      const trimmed = lines[index].trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const lineIndent = indentationWidth(lines[index]);
      if (lineIndent <= constructIndent) {
        bodyEnd = index;
        break;
      }
      bodyIndent = lines[index].match(/^[ \t]*/)?.[0] ?? bodyIndent;
      break;
    }

    ranges.push({
      className: classMatch[2],
      constructLine,
      bodyEnd,
      bodyIndent,
    });
    classLine = classEnd - 1;
  }

  return ranges;
}

export function enforceVoiceoverService(
  script: string,
  language: string,
): { script: string; provider: VoiceoverProvider } {
  const service = resolveVoiceoverService(language);
  let normalized = script.replace(
    /^[ \t]*from[ \t]+(?:eduvids_[A-Za-z0-9_]*tts|manim_voiceover\.services\.(?:gtts|elevenlabs))[ \t]+import[^\n]*(?:\n|$)/gm,
    "",
  );

  const lines = normalized.split("\n");
  let voiceoverImportLine = lines.findIndex((line) =>
    /^\s*from\s+manim_voiceover\s+import\s+.*\bVoiceoverScene\b/.test(line),
  );
  if (voiceoverImportLine === -1) {
    const manimImportLine = lines.findIndex((line) =>
      /^\s*from\s+manim\s+import\b/.test(line),
    );
    voiceoverImportLine = manimImportLine === -1 ? 0 : manimImportLine + 1;
    lines.splice(
      voiceoverImportLine,
      0,
      "from manim_voiceover import VoiceoverScene",
    );
  }
  lines.splice(voiceoverImportLine + 1, 0, service.serviceImport);
  normalized = replaceSpeechServiceCalls(
    lines.join("\n"),
    service.serviceExpression,
  );

  const normalizedLines = normalized.split("\n");
  const ranges = voiceoverConstructRanges(normalizedLines);
  if (ranges.length === 0) {
    throw new Error("Manim script has no VoiceoverScene class");
  }

  for (const range of [...ranges].reverse()) {
    const method = normalizedLines
      .slice(range.constructLine + 1, range.bodyEnd)
      .join("\n");
    if (!method.includes("self.set_speech_service(")) {
      normalizedLines.splice(
        range.constructLine + 1,
        0,
        `${range.bodyIndent}self.set_speech_service(${service.serviceExpression})`,
      );
    }
  }

  normalized = normalizedLines.join("\n").trim();
  const expectedSetter = `self.set_speech_service(${service.serviceExpression})`;
  const finalLines = normalized.split("\n");
  const finalRanges = voiceoverConstructRanges(finalLines);
  const importCount = finalLines.filter(
    (line) => line.trim() === service.serviceImport,
  ).length;
  const setterCount = normalized.split("self.set_speech_service(").length - 1;
  const expectedSetterCount = normalized.split(expectedSetter).length - 1;

  if (importCount !== 1 || setterCount !== expectedSetterCount) {
    throw new Error(
      `Voiceover provider enforcement failed for ${service.provider}`,
    );
  }
  for (const range of finalRanges) {
    const method = finalLines
      .slice(range.constructLine + 1, range.bodyEnd)
      .join("\n");
    if (!method.includes(expectedSetter)) {
      throw new Error(
        `Voiceover scene ${range.className} does not use ${service.provider}`,
      );
    }
  }

  return { script: normalized, provider: service.provider };
}

export function configureVoiceoverServicePrompt(
  prompt: string,
  language: string,
): string {
  const service = resolveVoiceoverService(language);

  return prompt
    .replaceAll(VOICEOVER_SERVICE_IMPORT_TOKEN, service.serviceImport)
    .replaceAll(
      VOICEOVER_SERVICE_SETTER_TOKEN,
      `self.set_speech_service(${service.serviceExpression})`,
    );
}

export function manimVoiceoverTimingIssues(
  script: string,
  expectedBeatCount = 0,
): string[] {
  const lines = script.split("\n");
  const issues: string[] = [];
  let timedBlockCount = 0;
  let voiceoverBlockCount = 0;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!/\bwith\s+self\.voiceover\(/.test(line)) continue;
    voiceoverBlockCount += 1;

    const header =
      /^(\s*)with\s+self\.voiceover\(\s*text\s*=([\s\S]+)\)\s+as\s+(\w+)\s*:\s*$/.exec(
        line,
      );
    if (!header) {
      issues.push(
        `voiceover block ${voiceoverBlockCount} has no timing tracker`,
      );
      continue;
    }

    timedBlockCount += 1;
    const blockIndent = indentationWidth(header[1]);
    const tracker = header[3];
    let bodyEnd = lines.length;
    for (let candidate = index + 1; candidate < lines.length; candidate++) {
      const trimmed = lines[candidate].trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      if (indentationWidth(lines[candidate]) <= blockIndent) {
        bodyEnd = candidate;
        break;
      }
    }

    const narrationLiteral = header[2].trim();
    const narration =
      narrationLiteral.length >= 2
        ? narrationLiteral.slice(1, -1).replace(/\\[nrt]/g, " ")
        : narrationLiteral;
    const wordCount = narration.split(/\s+/).filter(Boolean).length;
    const body = lines.slice(index + 1, bodyEnd).join("\n");
    const playCount = body.match(/\bself\.play\s*\(/g)?.length ?? 0;
    const alignedWait = new RegExp(
      `self\\.wait\\(\\s*max\\(\\s*0(?:\\.0+)?\\s*,\\s*${tracker}\\.get_remaining_duration\\(\\)\\s*\\)\\s*\\)`,
    ).test(body);

    if (wordCount > 22) {
      issues.push(
        `voiceover block ${voiceoverBlockCount} has ${wordCount} words; maximum is 22`,
      );
    }
    if (playCount === 0) {
      issues.push(
        `voiceover block ${voiceoverBlockCount} has no visual action`,
      );
    }
    if (!alignedWait) {
      issues.push(
        `voiceover block ${voiceoverBlockCount} does not align its final duration`,
      );
    }

    index = bodyEnd - 1;
  }

  if (voiceoverBlockCount === 0) {
    issues.push("script has no voiceover blocks");
  } else if (timedBlockCount < expectedBeatCount) {
    issues.push(
      `script has ${timedBlockCount} timed voiceover blocks for ${expectedBeatCount} planned beats`,
    );
  }

  return issues;
}

export interface VoiceoverScriptRequest {
  prompt: string;
  sessionId: string;
}

export interface ManimScriptRequest {
  prompt: string;
  voiceoverScript: string;
  sessionId: string;
  scenePlan?: ScenePlanEntry[];
  voiceoverLanguage?: string;
}

export interface ScenePlanElement {
  id: string;
  type: "text" | "math" | "label" | "diagram" | "graph" | "axis" | "shape";
  content: string;
  color?: string;
}

export interface ScenePlanLabel {
  targetElementId: string;
  labelText: string;
  position: "above" | "below" | "left" | "right";
}

export interface ScenePlanBeat {
  narration: string;
  focusElementIds: string[];
}

export interface ScenePlanEntry {
  sceneId: string;
  narration: string;
  visualType: string;
  elements: ScenePlanElement[];
  layout: string;
  maxSimultaneousElements: number;
  transitionIn: string;
  clearPrevious: boolean;
  labels: ScenePlanLabel[];
  beats: ScenePlanBeat[];
}

export function splitNarrationIntoTimingBeats(
  narration: string,
  maxWords = 18,
): string[] {
  const words = narration.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const beats: string[] = [];
  for (let start = 0; start < words.length; ) {
    let end = Math.min(start + maxWords, words.length);
    if (end < words.length) {
      const earliestNaturalBreak = Math.min(start + 8, end);
      for (let candidate = end; candidate > earliestNaturalBreak; candidate--) {
        if (/[.!?;,:]$/.test(words[candidate - 1])) {
          end = candidate;
          break;
        }
      }
    }
    beats.push(words.slice(start, end).join(" "));
    start = end;
  }
  return beats;
}

export function normalizeScenePlanTiming(
  scenePlan: ScenePlanEntry[],
): ScenePlanEntry[] {
  return scenePlan.map((scene) => {
    const elementIds = scene.elements.map((element) => element.id);
    const narrationBeats = splitNarrationIntoTimingBeats(scene.narration);
    return {
      ...scene,
      beats: narrationBeats.map((narration, index) => ({
        narration,
        focusElementIds:
          elementIds.length === 0
            ? []
            : [elementIds[Math.min(index, elementIds.length - 1)]],
      })),
    };
  });
}

const SCENE_PLAN_MAX_RETRIES = 1; // Durable workflow retries, never nested model retries.

export async function generateScenePlan({
  prompt,
  voiceoverScript,
  sessionId,
}: ManimScriptRequest): Promise<ScenePlanEntry[]> {
  const composedPrompt = `User request: ${prompt}\n\nVoiceover narration:\n${voiceoverScript}`;

  let lastError: unknown;

  for (let attempt = 0; attempt < SCENE_PLAN_MAX_RETRIES; attempt++) {
    const googleModel = await createGoogleModel("gemini-3.8-flash");
    const model = maybeWithTracing(googleModel.provider(googleModel.modelId), {
      posthogProperties: { $ai_session_id: sessionId },
    });

    try {
      const text = await streamTextWithTracking(
        {
          model,
          system: SCENE_PLAN_SYSTEM_PROMPT,
          prompt: composedPrompt,
          temperature: 0.3,
        },
        googleModel,
      );

      const cleaned = text
        .replace(/```json?\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();

      // Try strict parse first, then repair truncated/malformed JSON
      let parsed: ScenePlanEntry[];
      try {
        parsed = JSON.parse(cleaned) as ScenePlanEntry[];
      } catch {
        console.warn(
          `[generateScenePlan] Attempt ${attempt + 1}: strict JSON parse failed, trying jsonrepair`,
        );
        const repaired = jsonrepair(cleaned);
        parsed = JSON.parse(repaired) as ScenePlanEntry[];
      }

      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error(
          `Scene plan returned ${Array.isArray(parsed) ? "empty array" : typeof parsed} instead of a non-empty array`,
        );
      }

      console.log(
        `[generateScenePlan] Success on attempt ${attempt + 1}, ${parsed.length} scenes`,
      );
      return normalizeScenePlanTiming(parsed);
    } catch (err) {
      lastError = err;
      console.error(
        `[generateScenePlan] Attempt ${attempt + 1}/${SCENE_PLAN_MAX_RETRIES} failed:`,
        err,
      );
    }
  }

  throw new Error(
    `[generateScenePlan] All ${SCENE_PLAN_MAX_RETRIES} attempts failed. Last error: ${lastError}`,
  );
}

export async function generateVoiceoverScript({
  prompt,
  sessionId,
}: VoiceoverScriptRequest): Promise<string> {
  const systemPrompt = VOICEOVER_SYSTEM_PROMPT;

  const composedPrompt = [
    `User request: ${prompt}`,
    `Use the language that is asked for and output text in that script`,
    "Directive: When you mention an acronym, initialism, or all-caps mnemonic, write ONLY the phonetic pronunciation in lowercase without showing the uppercase form or parentheses, so TTS reads it naturally once (e.g., write 'soah caah toa' instead of 'SOH CAH TOA', write 'dee en ay' instead of 'DNA'). For well-known acronyms that TTS handles correctly (like 'NASA' or 'FBI'), you may use the standard form.",
    "Draft the narration voiceover:",
  ].join("\n\n");

  const googleModel = await createGoogleModel("gemini-3.5-flash-lite");

  const text = await streamTextWithTracking(
    {
      model: maybeWithTracing(googleModel.provider(googleModel.modelId), {
        posthogProperties: { $ai_session_id: sessionId },
      }),
      system: systemPrompt,
      prompt: composedPrompt,
      temperature: 0.5,
    },
    googleModel,
  );

  return text.trim();
}

const PROHIBITED_MODULES = [
  "os",
  "sys",
  "subprocess",
  "pathlib",
  "shutil",
  "socket",
  "requests",
  "http",
  "urllib",
  "multiprocessing",
  "psutil",
  "asyncio",
];

export function sanitizeManimScript(script: string): string {
  let result = script;

  // 1. Remove markdown fences and HTML tags
  result = result.replace(/```[\w]*\n?/g, "");
  // Do not strip HTML-like substrings: Python comparisons and string labels can contain them.

  // 2. Remove non-Python language blocks (JSON, JS/TS, YAML etc.)
  // Detect blocks that look like JSON objects/arrays at the top level
  result = result.replace(
    /^[ \t]*(\{[\s\S]*?"[\w]+"[\s\S]*?\}|^\[[\s\S]*?\])[ \t]*$/gm,
    (match) => {
      // Only remove if it looks like JSON (has quoted keys with colons)
      if (
        /"[\w]+"[\t ]*:/.test(match) &&
        !/^[ \t]*(#|def |class |from |import )/.test(match)
      ) {
        console.warn("[sanitizeManimScript] Removed JSON-like block");
        return "";
      }
      return match;
    },
  );
  // Remove lines that look like JS/TS (const/let/var declarations, =>, function keyword with braces)
  const jsPatterns =
    /^[ \t]*(const |let |var |function \w+\s*\(|export (default |))/;
  result = result
    .split("\n")
    .filter((line) => {
      if (jsPatterns.test(line)) {
        console.warn(
          `[sanitizeManimScript] Removed non-Python line: ${line.slice(0, 80)}`,
        );
        return false;
      }
      return true;
    })
    .join("\n");

  // 3. Fix common syntax issues

  // 3a. Fix unmatched parentheses/brackets
  const lines = result.split("\n");
  const openChars: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  const closeChars = new Set([")", "]", "}"]);
  const parenStack: string[] = [];
  let inString = false;
  let stringChar = "";

  for (const line of lines) {
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inString) {
        if (ch === stringChar && line[i - 1] !== "\\") {
          inString = false;
        }
        continue;
      }
      if (ch === '"' || ch === "'") {
        // Check for triple quotes
        if (line.slice(i, i + 3) === ch.repeat(3)) {
          // Skip triple-quoted strings for simplicity (multi-line)
          continue;
        }
        inString = true;
        stringChar = ch;
        continue;
      }
      if (ch === "#") break; // rest of line is comment
      if (openChars[ch]) {
        parenStack.push(openChars[ch]);
      } else if (closeChars.has(ch)) {
        if (parenStack.length > 0 && parenStack[parenStack.length - 1] === ch) {
          parenStack.pop();
        }
      }
    }
  }

  if (parenStack.length > 0) {
    console.warn(
      `[sanitizeManimScript] Closing ${parenStack.length} unmatched bracket(s): ${parenStack.join("")}`,
    );
    result = result + "\n" + parenStack.reverse().join("");
  }

  // 3b. Remove trailing incomplete lines (lines ending with an operator or opening bracket mid-expression, at the very end)
  const trimmedLines = result.split("\n");
  while (trimmedLines.length > 0) {
    const lastLine = trimmedLines[trimmedLines.length - 1].trim();
    if (
      lastLine === "" ||
      /[+\-*/=,\\]$/.test(lastLine) ||
      /[\(\[\{]$/.test(lastLine)
    ) {
      // Don't remove if it's a closing bracket we just added
      if (/^[)\]\}]+$/.test(lastLine)) break;
      // Don't remove blank lines that are mid-file
      if (lastLine === "" && trimmedLines.length > 1) {
        trimmedLines.pop();
        continue;
      }
      if (lastLine !== "") {
        console.warn(
          `[sanitizeManimScript] Removed trailing incomplete line: ${lastLine.slice(0, 80)}`,
        );
        trimmedLines.pop();
        continue;
      }
    }
    break;
  }
  result = trimmedLines.join("\n");

  // 4. Validate and fix imports
  if (
    !/from\s+manim\s+import\s/.test(result) &&
    !/import\s+manim/.test(result)
  ) {
    console.warn("[sanitizeManimScript] Added missing 'from manim import *'");
    result = "from manim import *\n" + result;
  }
  if (
    !/from\s+manim_voiceover\s+import\s/.test(result) &&
    !/import\s+manim_voiceover/.test(result)
  ) {
    console.warn("[sanitizeManimScript] Added missing manim_voiceover import");
    // Insert after the manim import line
    result = result.replace(
      /(from\s+manim\s+import\s+[^\n]+)/,
      "$1\nfrom manim_voiceover import VoiceoverScene",
    );
  }

  // Remove duplicate import lines
  const seenImports = new Set<string>();
  result = result
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (/^(from\s+\S+\s+import\s|import\s+)/.test(trimmed)) {
        if (seenImports.has(trimmed)) {
          console.warn(
            `[sanitizeManimScript] Removed duplicate import: ${trimmed}`,
          );
          return false;
        }
        seenImports.add(trimmed);
      }
      return true;
    })
    .join("\n");

  // 5. Remove disallowed imports
  result = result
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      // Match "import X" or "from X import ..."
      const importMatch = trimmed.match(
        /^(?:from\s+(\S+)\s+import|import\s+(\S+))/,
      );
      if (importMatch) {
        const mod = (importMatch[1] || importMatch[2]).split(".")[0];
        if (PROHIBITED_MODULES.includes(mod)) {
          console.warn(
            `[sanitizeManimScript] Removed prohibited import: ${trimmed}`,
          );
          return false;
        }
      }
      return true;
    })
    .join("\n");

  // 6. Ensure scene class structure (just verify, don't modify if missing)
  const hasSceneClass =
    /class\s+\w+\s*\([^)]*(?:Scene|VoiceoverScene)[^)]*\)\s*:/.test(result);
  if (!hasSceneClass) {
    console.warn(
      "[sanitizeManimScript] No Scene/VoiceoverScene class found; leaving script as-is for downstream error",
    );
  }

  // 7. Fix indentation: normalize mixed tabs/spaces to 4 spaces
  if (/\t/.test(result)) {
    console.warn(
      "[sanitizeManimScript] Normalized tabs to 4-space indentation",
    );
    result = result
      .split("\n")
      .map((line) => {
        // Replace leading tabs with 4 spaces each
        const leadingWhitespace = line.match(/^[\t ]*/)![0];
        const rest = line.slice(leadingWhitespace.length);
        const normalized = leadingWhitespace.replace(/\t/g, "    ");
        return normalized + rest;
      })
      .join("\n");
  }

  // 8. Remove empty/orphan trailing lines
  result = result.replace(/\n{3,}/g, "\n\n"); // collapse 3+ blank lines to 2
  result = result.replace(/\n+$/, "\n"); // single trailing newline

  // 9. Fix ThreeDScene inheritance order: VoiceoverScene must come first
  result = result.replace(
    /class\s+(\w+)\s*\(\s*ThreeDScene\s*,\s*VoiceoverScene\s*\)/g,
    "class $1(VoiceoverScene, ThreeDScene)",
  );

  return result.trim();
}

const MANIM_SCRIPT_MAX_RETRIES = 1;

export async function generateManimScript({
  prompt,
  voiceoverScript,
  sessionId,
  scenePlan,
  voiceoverLanguage,
}: ManimScriptRequest): Promise<string> {
  // Detect language from voiceover script using LLM
  const detectedLanguage =
    voiceoverLanguage ?? (await detectLanguage(voiceoverScript));
  console.log(`Detected language: ${detectedLanguage}`);

  // Build system prompt with language adjustments
  const augmentedSystemPrompt = buildAugmentedSystemPrompt(
    configureVoiceoverServicePrompt(MANIM_SYSTEM_PROMPT, detectedLanguage),
    detectedLanguage,
  );
  const timedScenePlan = scenePlan
    ? normalizeScenePlanTiming(scenePlan)
    : undefined;

  const generationPromptParts = [
    `User request: ${prompt}`,
    `Voiceover narration:\n${voiceoverScript}`,
    `Generate a complete Manim script as MULTIPLE ORDERED SCENE CLASSES (6-14 for videos, 4-8 for shorts). One concept per scene. Each scene is self-contained.`,
    `Use the layout templates from the system prompt.`,
  ];

  if (timedScenePlan) {
    generationPromptParts.push(
      `SCENE PLAN (follow this structure exactly):\n${JSON.stringify(timedScenePlan, null, 2)}`,
    );
  }

  const generationPrompt = generationPromptParts.join("\n\n");

  let lastError: unknown;

  for (let attempt = 0; attempt < MANIM_SCRIPT_MAX_RETRIES; attempt++) {
    const googleModel = await createGoogleModel("gemini-3.8-flash");
    const model = maybeWithTracing(googleModel.provider(googleModel.modelId), {
      posthogProperties: { $ai_session_id: sessionId },
    });

    try {
      const text = await streamTextWithTracking(
        {
          model: model,
          system: augmentedSystemPrompt,
          prompt: generationPrompt,
          temperature: 0.2,
          maxOutputTokens: 32_768,
        },
        googleModel,
      );

      const code = text
        .replace(/```python?\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();

      const sanitized = sanitizeManimScript(code);
      if (!/^class\s+\w+\s*\([^)]*Scene[^)]*\)\s*:/m.test(sanitized)) {
        throw new Error(
          "Manim script generation returned no renderable scene class",
        );
      }
      const enforced = enforceVoiceoverService(sanitized, detectedLanguage);
      const expectedBeatCount =
        timedScenePlan?.reduce(
          (count, scene) => count + (scene.beats?.length ?? 0),
          0,
        ) ?? 0;
      const timingIssues = manimVoiceoverTimingIssues(
        enforced.script,
        expectedBeatCount,
      );
      if (timingIssues.length > 0) {
        throw new Error(
          `Manim voiceover timing validation failed: ${timingIssues
            .slice(0, 6)
            .join("; ")}`,
        );
      }
      console.log("[generateManimScript] Voiceover service enforced", {
        language: detectedLanguage,
        provider: enforced.provider,
      });
      return enforced.script;
    } catch (err) {
      lastError = err;
      console.error(
        `[generateManimScript] Attempt ${attempt + 1}/${MANIM_SCRIPT_MAX_RETRIES} failed:`,
        err,
      );
      // reportError is already called inside streamTextWithTracking,
      // so the failed key is marked and the next createGoogleModel call
      // will select a different unblocked key.
    }
  }

  console.error(
    `[generateManimScript] All ${MANIM_SCRIPT_MAX_RETRIES} attempts exhausted`,
    lastError,
  );
  throw new Error(`Manim script generation failed: ${safeError(lastError)}`);
}

// ---------------------------------------------------------------------------
// YouTube title generation
// ---------------------------------------------------------------------------

export interface VideoTitleRequest {
  prompt: string;
  sessionId: string;
}

export async function generateVideoTitles({
  prompt,
  sessionId,
}: VideoTitleRequest): Promise<VideoTitleSet> {
  const systemPrompt = `You package videos for eduvids, a cinematic visual math and science channel. Generate exactly three distinct YouTube title candidates, ordered strongest first.

RULES:
- Aim for 45-65 characters; never exceed 80
- Create curiosity while making the subject immediately clear
- Prefer natural use of Why, How, What, Visualized, Intuitive, Actually, In 3D, or Finally Makes Sense
- Never use the words Explained, Basics, Introduction, or Lesson
- Avoid hype, clickbait, vague promises, and repeated title structures
- Use natural title case, not all caps
- Strong examples: "What Even Is a Tensor? Visualized From 0D to 3D" / "Why Differentiation Actually Works" / "The 5 Ways Two Triangles Can Be Exactly the Same"
- Return ONLY a JSON array of three strings`;

  const userPrompt = `Generate three title candidates for this animated educational video: "${prompt}"`;

  const googleModel = await createGoogleModel("gemini-3.5-flash-lite");
  const model = maybeWithTracing(googleModel.provider(googleModel.modelId), {
    posthogProperties: { $ai_session_id: sessionId },
  });

  const text = await streamTextWithTracking(
    {
      model,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.8,
    },
    googleModel,
  );

  return parseVideoTitleSet(text);
}

// ---------------------------------------------------------------------------
// YouTube description generation
// ---------------------------------------------------------------------------

export interface VideoDescriptionRequest {
  prompt: string;
  voiceoverScript: string;
  sessionId: string;
  variant?: "video" | "short";
}

export async function generateVideoDescription({
  prompt,
  voiceoverScript,
  sessionId,
  variant,
}: VideoDescriptionRequest): Promise<string> {
  const systemPrompt = `You package videos for eduvids, a cinematic visual math and science channel. Write the sales-first opening of a YouTube description.

RULES:
- Output exactly two short, non-empty lines and no blank line
- Line 1 opens with the central mystery, surprising result, or useful problem
- Line 2 promises the specific visual intuition the viewer will gain
- Naturally include 2-3 precise topic keywords across the two lines
- Do not repeat the title or start with "In this video"
- Never use generic phrases such as "dive into", "join us", "embark on", or "unlock the secrets"
- Do not include calls-to-action, links, hashtags, timestamps, or labels
- Keep the total under 500 characters
- Output only the two lines`;

  const userPrompt = `Create a YouTube description for this ${
    variant === "short" ? "vertical short" : "video"
  }.

TOPIC: ${prompt}

VOICEOVER SCRIPT:
${voiceoverScript}`;

  const googleModel = await createGoogleModel("gemini-3.5-flash-lite");
  const model = maybeWithTracing(googleModel.provider(googleModel.modelId), {
    posthogProperties: { $ai_session_id: sessionId },
  });

  const text = await streamTextWithTracking(
    {
      model,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.5,
    },
    googleModel,
  );

  return text
    .trim()
    .replace(/^["']|["']$/g, "")
    .slice(0, 500);
}

// ---------------------------------------------------------------------------
// Script fixer – diff-based error correction via gemini-3.5-flash-lite
// ---------------------------------------------------------------------------

const SEARCH_REPLACE_MARKERS = {
  search: "<<<<<<< SEARCH",
  divider: "=======",
  replace: ">>>>>>> REPLACE",
} as const;

function applySearchReplaceDiffs(script: string, diffOutput: string): string {
  if (!diffOutput.includes(SEARCH_REPLACE_MARKERS.search)) {
    // Model returned the full script instead of diffs
    const code = diffOutput
      .replace(/```python?\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
    if (code.includes("from manim import") && /class\s+\w+.*Scene/.test(code)) {
      return code;
    }
    // Unrecognised output – return original
    console.warn(
      "[fixManimScript] Output has no diff markers and doesn't look like a full script; returning original",
    );
    return script;
  }

  const blocks = diffOutput.split(SEARCH_REPLACE_MARKERS.search);
  let result = script;

  for (const block of blocks.slice(1)) {
    const divIdx = block.indexOf(SEARCH_REPLACE_MARKERS.divider);
    if (divIdx === -1) continue;

    const searchPart = block.slice(0, divIdx);
    const rest = block.slice(divIdx + SEARCH_REPLACE_MARKERS.divider.length);
    const replaceEndIdx = rest.indexOf(SEARCH_REPLACE_MARKERS.replace);
    if (replaceEndIdx === -1) continue;

    const replacePart = rest.slice(0, replaceEndIdx);

    // Strip only the first and last newline to preserve inner whitespace
    const search = searchPart.replace(/^\n/, "").replace(/\n$/, "");
    const replace = replacePart.replace(/^\n/, "").replace(/\n$/, "");

    if (result.includes(search)) {
      result = result.replace(search, replace);
    } else {
      console.warn(
        "[fixManimScript] Could not locate SEARCH block in script – skipping",
      );
    }
  }

  return result;
}

export interface FixManimScriptRequest {
  script: string;
  errors: string;
  sessionId: string;
  voiceoverLanguage: string;
}

export async function fixManimScript({
  script,
  errors,
  sessionId,
  voiceoverLanguage,
}: FixManimScriptRequest): Promise<string> {
  const enforceProvider = (candidate: string) =>
    enforceVoiceoverService(candidate, voiceoverLanguage).script;
  const heuristicFixed = fixManimScriptHeuristically(script, errors);
  if (heuristicFixed.changed) {
    console.warn(
      "[fixManimScript] Applied heuristic fix before LLM:",
      heuristicFixed.notes.join("; "),
    );
    return enforceProvider(heuristicFixed.script);
  }

  // Fetch relevant manim docs from DeepWiki (best-effort)
  const manimDocs = await queryManimDocs(errors);

  const systemPrompt = `You are a Manim Community v0.19.0 debugging expert.
You receive a Manim script and the errors produced when running it.
Your job is to output ONLY search/replace diff blocks that fix the errors.

OUTPUT FORMAT — output NOTHING else:
<<<<<<< SEARCH
exact lines from the current script that need to change
=======
the corrected replacement lines
>>>>>>> REPLACE

RULES:
- Make MINIMAL changes — fix only what the errors indicate.
- The SEARCH block must match the script EXACTLY (including indentation).
- You may output multiple diff blocks.
- Do NOT add commentary, markdown fences, or explanations.
- Do NOT refactor or rewrite unrelated code.
- Preserve all existing imports, class names, and voiceover text.

`;

  const userPrompt = [
    "ERRORS:",
    errors.slice(0, 6000),
    "",
    manimDocs ? `RELEVANT MANIM DOCUMENTATION:\n${manimDocs}\n` : "",
    "CURRENT SCRIPT:",
    "```python",
    script,
    "```",
  ].join("\n");

  const googleModel = await createGoogleModel("gemini-3.8-flash");
  const model = maybeWithTracing(googleModel.provider(googleModel.modelId), {
    posthogProperties: { $ai_session_id: sessionId },
  });

  try {
    const text = await streamTextWithTracking(
      {
        model,
        system: systemPrompt,
        prompt: userPrompt,
        temperature: 0,
      },
      googleModel,
    );

    const fixed = applySearchReplaceDiffs(script, text.trim());
    if (fixed !== script) return enforceProvider(fixed);

    const heuristicAfter = fixManimScriptHeuristically(script, errors);
    if (heuristicAfter.changed) {
      console.warn(
        "[fixManimScript] Applied heuristic fix after LLM:",
        heuristicAfter.notes.join("; "),
      );
      return enforceProvider(heuristicAfter.script);
    }

    return enforceProvider(script);
  } catch (err) {
    console.error("[fixManimScript] LLM call failed:", err);
    // Return original script so the caller can decide whether to retry
    const heuristicAfter = fixManimScriptHeuristically(script, errors);
    if (heuristicAfter.changed) {
      console.warn(
        "[fixManimScript] Applied heuristic fix after LLM failure:",
        heuristicAfter.notes.join("; "),
      );
      return enforceProvider(heuristicAfter.script);
    }
    return enforceProvider(script);
  }
}

type HeuristicFixResult = {
  script: string;
  changed: boolean;
  notes: string[];
};

function fixManimScriptHeuristically(
  script: string,
  errors: string,
): HeuristicFixResult {
  let updated = script;
  const notes: string[] = [];

  // fix_in_frame() is ManimGL-only; Manim Community uses self.add_fixed_in_frame_mobjects()
  if (
    /has no attribute 'fix_in_frame'/.test(errors) ||
    /fix_in_frame/.test(updated)
  ) {
    const fixInFrameRegex = /^([ \t]*)(\w+)\.fix_in_frame\(\)/gm;
    let match: RegExpExecArray | null;
    while ((match = fixInFrameRegex.exec(updated)) !== null) {
      // We need to find the correct self reference — look for the class method context
      const indent = match[1];
      const varName = match[2];
      updated = updated.replace(
        match[0],
        `${indent}self.add_fixed_in_frame_mobjects(${varName})`,
      );
      notes.push(
        `replaced ${varName}.fix_in_frame() with self.add_fixed_in_frame_mobjects(${varName})`,
      );
    }
  }

  const nameErrorMatch = /NameError:\s+name\s+'([^']+)' is not defined/.exec(
    errors,
  );
  if (nameErrorMatch) {
    const missingName = nameErrorMatch[1];
    const rateFuncMap: Record<string, string> = {
      slow_into_fast: "rate_functions.smooth",
      slow_into: "rate_functions.smooth",
      rush_into: "rate_functions.rush_into",
      rush_from: "rate_functions.rush_from",
      there_and_back: "rate_functions.there_and_back",
      there_and_back_with_pause: "rate_functions.there_and_back_with_pause",
      linear: "rate_functions.linear",
      smooth: "rate_functions.smooth",
      double_smooth: "rate_functions.double_smooth",
    };

    const replacement = rateFuncMap[missingName];
    if (replacement) {
      const nameRegex = new RegExp(`\\b${missingName}\\b`, "g");
      if (nameRegex.test(updated)) {
        updated = updated.replace(nameRegex, replacement);
        notes.push(`replaced ${missingName} with ${replacement}`);
      }

      if (
        updated !== script &&
        !/from\s+manim\s+import\s+.*\brate_functions\b/.test(updated) &&
        !/import\s+manim\s+as\s+\w+/.test(updated)
      ) {
        const importMatch = /from\s+manim\s+import\s+([^\n]+)/.exec(updated);
        if (importMatch) {
          const existing = importMatch[1];
          if (!existing.includes("rate_functions")) {
            const patched = existing.trim().endsWith(",")
              ? `${existing} rate_functions`
              : `${existing}, rate_functions`;
            updated = updated.replace(
              importMatch[0],
              `from manim import ${patched}`,
            );
            notes.push("added rate_functions to manim import");
          }
        } else if (updated.includes("import manim as")) {
          // Prefer explicit import for rate_functions if using manim alias elsewhere
          updated = `from manim import rate_functions\n${updated}`;
          notes.push("added explicit rate_functions import");
        } else {
          updated = `from manim import rate_functions\n${updated}`;
          notes.push("added rate_functions import");
        }
      }
    }

    // Map invalid color names to valid Manim default-namespace colors
    const colorMap: Record<string, string> = {
      CYAN: "TEAL",
      MAGENTA: "PINK",
      LIME: "GREEN",
      SILVER: "GRAY",
      AQUA: "TEAL_A",
      NAVY: "DARK_BLUE",
      OLIVE: "GREEN_D",
      BROWN: "DARK_BROWN",
      INDIGO: "PURPLE_E",
      VIOLET: "PURPLE_A",
    };
    const colorReplacement = colorMap[missingName];
    if (colorReplacement) {
      const colorRegex = new RegExp(`\\b${missingName}\\b`, "g");
      if (colorRegex.test(updated)) {
        updated = updated.replace(colorRegex, colorReplacement);
        notes.push(
          `replaced invalid color ${missingName} with ${colorReplacement}`,
        );
      }
    }
  }

  return { script: updated, changed: updated !== script, notes };
}

// ---------------------------------------------------------------------------
// Frame review – vision-based quality check of rendered frames
// ---------------------------------------------------------------------------

export interface ReviewRenderedFramesRequest {
  frames: string[];
  script: string;
  sessionId: string;
}

export interface ReviewRenderedFramesResult {
  issues: string[];
  overallQuality: "good" | "needs_fixes";
  suggestedFixes: string;
}

export async function reviewRenderedFrames({
  frames,
  script,
  sessionId,
}: ReviewRenderedFramesRequest): Promise<ReviewRenderedFramesResult> {
  const systemPrompt = `You are a visual quality reviewer for educational math/science animation frames rendered by Manim.
You will receive rendered frames as images and the script that produced them.
Evaluate the frames for the following issues:
- Overlapping elements (text over text, shapes over shapes)
- Off-screen or clipped content (elements cut off at edges)
- Text too small to read
- Missing labels (unlabeled axes, shapes, or formula parts)
- Too many elements on screen at once (more than 5-6 simultaneously)
- Poor spacing (elements too close together, cramped layout)

IMPORTANT: Do NOT flag text that serves as a label for a vector, arrow, or geometric element if it is positioned next to or along that element. Such labels are intentionally placed to move with the arrow/vector and should NOT be treated as a text readability issue. Only flag text that is genuinely unreadable or overlapping other text.

OUTPUT FORMAT — output ONLY valid JSON, no markdown fences:
{
  "issues": ["description of issue 1", "description of issue 2"],
  "overallQuality": "good" or "needs_fixes",
  "suggestedFixes": "brief description of how to fix the issues"
}

If there are no issues, return:
{
  "issues": [],
  "overallQuality": "good",
  "suggestedFixes": ""
}`;

  const googleModel = await createGoogleModel("gemini-3.5-flash-lite");
  const model = maybeWithTracing(googleModel.provider(googleModel.modelId), {
    posthogProperties: { $ai_session_id: sessionId },
  });

  // Frames are 640px-wide PNGs (1 per scene), small enough to send all of them
  // so the vision model can evaluate every scene's layout.
  const content: Array<
    { type: "text"; text: string } | { type: "image"; image: string }
  > = [
    { type: "text", text: `SCRIPT:\n${script}` },
    ...frames.map((frame) => ({ type: "image" as const, image: frame })),
    {
      type: "text",
      text: `Review all ${frames.length} frames above (one per scene) for visual quality issues.`,
    },
  ];

  try {
    const text = await streamTextWithTracking(
      {
        model,
        system: systemPrompt,
        messages: [{ role: "user", content }],
        temperature: 0.2,
      },
      googleModel,
    );

    const cleaned = text
      .replace(/```json?\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    return JSON.parse(cleaned) as ReviewRenderedFramesResult;
  } catch (err) {
    console.error("[reviewRenderedFrames] Failed:", err);
    return {
      issues: [],
      overallQuality: "good",
      suggestedFixes: "",
    };
  }
}
