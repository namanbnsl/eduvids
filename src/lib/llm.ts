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
  createGoogleModel,
  type GoogleModelConfig,
  reportSuccess,
  reportError,
} from "./google-provider";
import { queryManimDocs } from "./deepwiki";

import { jsonrepair } from "jsonrepair";
import { protectLatexBackslashes } from "./latex-json";
import { franc } from "franc";
import { VIDEO_BACKGROUND } from "./video-style";
import {
  generateValidatedMetadata,
  parseVideoDescriptionPackage,
  parseVideoTitleSet,
  type VideoDescriptionPackage,
  type VideoTitleSet,
} from "./youtube-metadata";

// @ts-expect-error langs has no types
import langs from "langs";

import { withTracing } from "@posthog/ai";
import { PostHog } from "posthog-node";

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
    console.error("[AI generation] Stream failed", {
      modelId: googleConfig?.modelId,
      error: safeError(failure),
    });
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
1. USE Text() FOR NON-MATHEMATICAL WORDS ONLY (no digits): Text("your text", font_size=36)
2. USE MathTex() FOR ALL MATH AND FOR ANY NUMBERS OR DIGITS SHOWN ONSCREEN: MathTex(r"E = mc^2", font_size=36)
3. If a label mixes words and numbers, split into Text() + MathTex() in a VGroup
4. Never pass font=, weight=, or disable_ligatures to Text(); the house style sets the typeface for every script (disable_ligatures also truncates multi-word text)
5. For bullets in ${language}: Create Text() objects and arrange them manually, left-aligned
6. Example correct usage:
   title = Text("${
     language === "spanish"
       ? "Título"
       : language === "french"
         ? "Titre"
         : language === "german"
           ? "Titel"
           : "Title"
   }", font_size=48)
   body = Text("${
     language === "spanish"
       ? "Contenido"
       : language === "french"
         ? "Contenu"
         : language === "german"
           ? "Inhalt"
           : "Content"
   }", font_size=36)
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

// Animations that bring something new on screen. Opening a beat with one of
// these stretched over a share of the narration finishes the picture after the
// narrator has already named it.
const REVEAL_ANIMATIONS = new Set([
  "pop_in",
  "FadeIn",
  "Write",
  "Create",
  "DrawBorderThenFill",
  "GrowFromCenter",
  "GrowFromPoint",
  "GrowFromEdge",
  "GrowArrow",
  "SpinInFromNothing",
  "AddTextLetterByLetter",
]);
export const OPENING_REVEAL_MAX_SECONDS = 1;

/**
 * Top-level comma-separated pieces of a call's argument text, or null when the
 * text is not one balanced argument list (`a); self.play(b`).
 */
function splitTopLevelArguments(text: string): string[] | null {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quote) {
      if (char === "\\") index++;
      else if (char === quote) quote = null;
    } else if (char === '"' || char === "'") quote = char;
    else if ("([{".includes(char)) depth++;
    else if (")]}".includes(char)) {
      depth--;
      if (depth < 0) return null;
    } else if (char === "," && depth === 0) {
      parts.push(text.slice(start, index));
      start = index + 1;
    }
  }
  if (depth !== 0 || quote) return null;
  parts.push(text.slice(start));
  return parts.map((part) => part.trim()).filter(Boolean);
}

/**
 * Show, then say: narration starts a fixed lead after each voiceover block
 * begins (NARRATION_LEAD in video_style.py), so the block's opening reveal must
 * land quickly. Cap an opening reveal whose run time is a share of the
 * narration (`run_time=tracker.duration * 0.35` on a six-second line is a
 * two-second fade). Plays that also carry motion are left alone.
 */
function capOpeningReveal(line: string, tracker: string): string {
  const call = /^(\s*self\.play\()(.*)(\)\s*)$/.exec(line);
  if (!call) return line;
  const args = splitTopLevelArguments(call[2]);
  if (!args) return line;
  const runTimeIndex = args.findIndex((arg) => /^run_time\s*=/.test(arg));
  if (runTimeIndex < 0) return line;
  const runTime = args[runTimeIndex].replace(/^run_time\s*=\s*/, "");
  const tied = new RegExp(
    `\\b${tracker}\\s*\\.\\s*(?:duration|get_remaining_duration)\\b`,
  ).test(runTime);
  if (!tied || /^min\(\s*1(?:\.0*)?\s*,/.test(runTime)) return line;
  const animations = args.filter((arg) => !/^\w+\s*=/.test(arg));
  const allReveals =
    animations.length > 0 &&
    animations.every((arg) => {
      const name = /^([A-Za-z_]\w*)\s*\(/.exec(arg)?.[1];
      return name !== undefined && REVEAL_ANIMATIONS.has(name);
    });
  if (!allReveals) return line;
  args[runTimeIndex] =
    `run_time=min(${OPENING_REVEAL_MAX_SECONDS.toFixed(1)}, ${runTime})`;
  return `${call[1]}${args.join(", ")}${call[3]}`;
}

// The model often ends a voiceover block without the closing hold, or writes it
// unguarded. Both are mechanical to fix, so close every block the same way
// instead of failing generation and spending another LLM call. The same goes
// for a slow opening reveal, which would leave the picture behind the voice.
export function alignVoiceoverDurations(script: string): string {
  const lines = script.split("\n");

  for (let index = 0; index < lines.length; index++) {
    const header =
      /^(\s*)with\s+self\.voiceover\(\s*text\s*=[\s\S]+\)\s+as\s+(\w+)\s*:\s*$/.exec(
        lines[index],
      );
    if (!header) continue;

    const blockIndent = indentationWidth(header[1]);
    const tracker = header[2];
    let bodyEnd = lines.length;
    let lastBodyLine = -1;
    let bodyIndent: string | undefined;
    for (let candidate = index + 1; candidate < lines.length; candidate++) {
      const trimmed = lines[candidate].trim();
      if (!trimmed) continue;
      if (trimmed.startsWith("#")) continue;
      if (indentationWidth(lines[candidate]) <= blockIndent) {
        bodyEnd = candidate;
        break;
      }
      bodyIndent ??= lines[candidate].match(/^[ \t]*/)?.[0];
      lastBodyLine = candidate;
    }
    if (lastBodyLine < 0 || bodyIndent === undefined) continue;

    for (let line = index + 1; line <= lastBodyLine; line++) {
      if (!/^\s*self\.play\(/.test(lines[line])) continue;
      if (lines[line].match(/^[ \t]*/)?.[0] === bodyIndent)
        lines[line] = capOpeningReveal(lines[line], tracker);
      break;
    }

    const canonical = `self.wait(max(0, ${tracker}.get_remaining_duration()))`;
    const remaining = `${tracker}\\s*\\.\\s*get_remaining_duration\\(\\s*\\)`;
    const looseWait = new RegExp(
      `self\\.wait\\(\\s*(?:${remaining}|max\\(\\s*${remaining}\\s*,\\s*0(?:\\.0*)?\\s*\\)|max\\(\\s*0(?:\\.0*)?\\s*,\\s*${remaining}\\s*\\))\\s*(?:,[^()]*)?\\)`,
      "g",
    );
    let aligned = false;
    for (let line = index + 1; line <= lastBodyLine; line++) {
      lines[line] = lines[line].replace(looseWait, canonical);
      if (lines[line].includes(canonical)) aligned = true;
    }

    if (!aligned) {
      lines.splice(lastBodyLine + 1, 0, `${bodyIndent}${canonical}`);
      bodyEnd += 1;
    }
    index = bodyEnd - 1;
  }

  return lines.join("\n");
}

export function manimVoiceoverTimingIssues(
  script: string,
  expectedBeatCount = 0,
): string[] {
  const lines = script.split("\n");
  const issues: string[] = [];
  let timedBlockCount = 0;
  let voiceoverBlockCount = 0;
  let visualActionBlockCount = 0;

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
        `voiceover block ${voiceoverBlockCount} has no timing tracker: ${line.trim().slice(0, 100)}`,
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
    // Generated scenes can legitimately change the frame without self.play().
    // Fixed 3D overlays, direct reveals, and camera movement are all visible
    // actions and should not fail an otherwise renderable script.
    const hasVisualAction =
      /\bself\.(?:play|add|add_fixed_in_frame_mobjects|add_foreground_mobjects?|remove|clear|move_camera|set_camera_orientation|begin_ambient_camera_rotation|stop_ambient_camera_rotation)\s*\(/.test(
        body,
      );
    const alignedWait = new RegExp(
      `self\\.wait\\(\\s*max\\(\\s*0(?:\\.0+)?\\s*,\\s*${tracker}\\.get_remaining_duration\\(\\)\\s*\\)\\s*\\)`,
    ).test(body);

    if (wordCount > 22) {
      issues.push(
        `voiceover block ${voiceoverBlockCount} has ${wordCount} words; maximum is 22`,
      );
    }
    if (hasVisualAction) visualActionBlockCount += 1;
    if (!alignedWait) {
      issues.push(
        `voiceover block ${voiceoverBlockCount} does not align its final duration`,
      );
    }

    index = bodyEnd - 1;
  }

  if (voiceoverBlockCount === 0) {
    issues.push("script has no voiceover blocks");
  } else if (visualActionBlockCount === 0) {
    // A short narration hold over an existing diagram is valid pacing. Only an
    // entirely static script is a fatal generation error.
    issues.push("script has no visual action in any voiceover block");
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
  type:
    | "text"
    | "math"
    | "label"
    | "diagram"
    | "graph"
    | "axis"
    | "shape"
    | "surface"
    | "vector"
    | "region"
    | "population"
    | "prop";
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
  /** Starts a new YouTube chapter when present. */
  chapterTitle?: string;
  narration: string;
  visualType: string;
  /** How the scene teaches: zoom_journey, population, to_scale, ... */
  visualDevice?: string;
  /** The scene's motion from first frame to last, with real magnitudes. */
  storyboard?: string;
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
    const elementIdSet = new Set(elementIds);
    const suppliedBeats = Array.isArray(scene.beats) ? scene.beats : [];
    const suppliedNarration = suppliedBeats
      .map((beat) => beat.narration?.trim())
      .filter(Boolean)
      .join(" ")
      .replace(/\s+/g, " ");
    const sceneNarration = scene.narration.trim().replace(/\s+/g, " ");
    const hasFaithfulBeatPlan =
      suppliedBeats.length > 0 && suppliedNarration === sceneNarration;
    const fallbackFocusIds = (index: number) =>
      elementIds.length === 0
        ? []
        : [elementIds[Math.min(index, elementIds.length - 1)]];

    const beats = hasFaithfulBeatPlan
      ? suppliedBeats.flatMap((beat, beatIndex) => {
          const focusElementIds = (beat.focusElementIds ?? []).filter((id) =>
            elementIdSet.has(id),
          );
          return splitNarrationIntoTimingBeats(beat.narration).map(
            (narration) => ({
              narration,
              focusElementIds:
                focusElementIds.length > 0
                  ? focusElementIds.slice(0, 2)
                  : fallbackFocusIds(beatIndex),
            }),
          );
        })
      : splitNarrationIntoTimingBeats(scene.narration).map(
          (narration, index) => ({
            narration,
            focusElementIds: fallbackFocusIds(index),
          }),
        );

    return {
      ...scene,
      beats,
    };
  });
}

const PICTURE_ELEMENT_TYPES = new Set([
  "diagram",
  "graph",
  "axis",
  "shape",
  "surface",
  "vector",
  "region",
  "population",
  "prop",
]);

/**
 * Deterministic checks for scenes that would teach with words instead of
 * pictures. The notes go to the animator with the plan, so a text-only or
 * formula-only scene gets a picture rather than a slide.
 */
export function scenePlanVisualGaps(scenePlan: ScenePlanEntry[]): string[] {
  const notes: string[] = [];
  let run = 1;
  scenePlan.forEach((scene, index) => {
    const elements = Array.isArray(scene.elements) ? scene.elements : [];
    const hasPicture = elements.some((element) =>
      PICTURE_ELEMENT_TYPES.has(element.type),
    );
    const hasFormula = elements.some((element) => element.type === "math");
    const device = scene.visualDevice?.trim();
    if (!hasPicture) {
      notes.push(
        hasFormula
          ? `${scene.sceneId}: only text and formulas are planned. Draw the thing the formula describes beside it and link() each symbol to its part.`
          : `${scene.sceneId}: only text is planned. Show the idea as a picture (a prop, crowd, chart, timeline, diagram or graph); keep words to one short line.`,
      );
    } else if (hasFormula && device !== "equation_link") {
      notes.push(
        `${scene.sceneId}: tie the formula to the picture: give each symbol the colour of its part and link() them in the beat that names it.`,
      );
    }
    if (!device) {
      notes.push(
        `${scene.sceneId}: no visual device was planned. Pick the clearest one for this idea from the system prompt's devices.`,
      );
    }
    const pictured = [
      scene.storyboard ?? "",
      ...elements.map((element) => `${element.content ?? ""}`),
    ].join(" ");
    for (const [pattern, helper] of SIGNATURE_VISUALS) {
      if (pattern.test(pictured)) notes.push(`${scene.sceneId}: ${helper}`);
    }
    const previous = scenePlan[index - 1]?.visualDevice?.trim();
    run = device && device === previous ? run + 1 : 1;
    if (run === 3) {
      notes.push(
        `${scene.sceneId}: third "${device}" scene in a row. Vary the motion so the rhythm does not flatten.`,
      );
    }
  });
  // The video keeps the thumbnail's promise: a hook picture first, and the
  // same engagement devices (struck guess, big number, pointer) inside.
  const opening = scenePlan[0]?.visualDevice?.trim();
  if (opening && !HOOK_DEVICES.has(opening)) {
    notes.push(
      `${scenePlan[0]!.sceneId}: open on the topic's most striking picture in the first second (a signature visual, crowd, zoom, big number or predict-reveal), not a "${opening}" build.`,
    );
  }
  if (
    scenePlan.length &&
    !scenePlan.some((scene) =>
      ENGAGEMENT_DEVICES.has(scene.visualDevice?.trim() ?? ""),
    )
  ) {
    notes.push(
      "No engagement beat is planned. Strike the tempting wrong answer with correct() where the narration names it, land the payoff with big_number() or point_at(), and point_at() the surprising detail of at least one picture.",
    );
  }
  return notes;
}

// Pictures the house style draws exactly. A hand-built version (the Lorenz
// equations stepped in a loop, a few ellipses, a ribbon surface, a curve in
// raw units on tiny ThreeDAxes) looks wrong and can run off the frame.
const SIGNATURE_VISUALS: Array<[RegExp, string]> = [
  [
    /\battractor\b|\bbutterfly\b|\blorenz\b(?!['’]?s?\s+(?:equations?|system|model))/i,
    "draw the Lorenz attractor with lorenz() (in a ThreeDScene: lorenz(three_d=True), fitted with place_3d_in_content, no ThreeDAxes). Never integrate the equations yourself or stand in ellipses, spirals or a surface for it.",
  ],
  [
    /golden (?:spiral|rectangle)|fibonacci spiral/i,
    "draw it with golden_spiral() instead of building the squares and arcs by hand.",
  ],
  [
    /prime spiral|ulam spiral|primes? in polar/i,
    "draw it with prime_spiral() instead of placing primes by hand.",
  ],
  [/sierpi[nń]ski/i, "draw it with sierpinski() instead of recursing by hand."],
  [/\bkoch\b|snowflake/i, "draw it with koch() instead of recursing by hand."],
  [
    /fractal tree/i,
    "draw it with fractal_tree() instead of recursing by hand.",
  ],
];

const ENGAGEMENT_DEVICES = new Set([
  "correction",
  "big_number",
  "point_at",
  "predict_reveal",
]);

const HOOK_DEVICES = new Set([
  ...ENGAGEMENT_DEVICES,
  "zoom_journey",
  "population",
  "to_scale",
  "timeline",
  "trajectory",
  "parameter_sweep",
  "particles",
  "before_after",
  "morph",
  "live_tracker",
]);

const SCENE_PLAN_MAX_RETRIES = 1; // Durable workflow retries, never nested model retries.

export async function generateScenePlan({
  prompt,
  voiceoverScript,
  sessionId,
}: ManimScriptRequest): Promise<ScenePlanEntry[]> {
  const composedPrompt = `User request: ${prompt}\n\nVoiceover narration:\n${voiceoverScript}\n\nWrite every chapterTitle in the same language as this narration. Scene IDs are code identifiers, not chapter names.`;

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

      // Keep "\theta" and "\infty" in formulas: JSON would read a tab or drop the backslash.
      const cleaned = protectLatexBackslashes(
        text
          .replace(/```json?\n?/g, "")
          .replace(/```\n?/g, "")
          .trim(),
      );

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

  const googleModel = await createGoogleModel("gemini-3.8-flash");

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

/**
 * Put every `with self.voiceover(...) as tracker:` header on one line with an
 * explicit text= argument. Smaller fallback models often wrap the narration
 * over several lines or pass it positionally, which the timing check (and
 * the prefetcher) cannot read.
 */
export function normalizeVoiceoverHeaders(script: string): string {
  const lines = script.split("\n");
  const output: string[] = [];
  for (let index = 0; index < lines.length; index++) {
    let line = lines[index]!;
    if (
      /^\s*with\s+self\.voiceover\(/.test(line) &&
      !/:\s*(#.*)?$/.test(line)
    ) {
      let end = index;
      while (
        end + 1 < lines.length &&
        end - index < 8 &&
        !/:\s*(#.*)?$/.test(lines[end]!)
      ) {
        end++;
      }
      if (/:\s*(#.*)?$/.test(lines[end]!)) {
        const indent = line.match(/^\s*/)![0];
        line =
          indent +
          lines
            .slice(index, end + 1)
            .map((part) => part.trim())
            .join(" ")
            .replace(/\(\s+/g, "(")
            .replace(/\s+\)/g, ")");
        index = end;
      }
    }
    line = line
      .replace(
        /^(\s*with\s+self\.voiceover\()\s*(?=[rfbu]{0,2}["'])/i,
        "$1text=",
      )
      .replace(
        /^(\s*with\s+self\.voiceover\(.*\)\s+as\s+\w+\s*:)\s*#.*$/,
        "$1",
      );
    output.push(line);
  }
  return output.join("\n");
}

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

  // Keep every generated video on its thumbnail's canvas, even if the model
  // omits or overrides the background.
  if (/config\.background_color\s*=/.test(result)) {
    result = result.replace(
      /config\.background_color\s*=\s*[^\n]+/,
      `config.background_color = "${VIDEO_BACKGROUND}"`,
    );
  } else {
    result = result.replace(
      /(from\s+manim\s+import\s+[^\n]+)/,
      `$1\n\nconfig.background_color = "${VIDEO_BACKGROUND}"`,
    );
  }

  result = normalizeVoiceoverHeaders(result);

  // Manim 0.20 drops one trailing glyph per space when ligatures are disabled
  // ("Area of a Circle" renders as "Area of a Cir"), so never pass the flag.
  result = result.replace(/,\s*disable_ligatures\s*=\s*(?:True|False)/g, "");

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
    const visualGaps = scenePlanVisualGaps(timedScenePlan);
    if (visualGaps.length > 0) {
      console.warn(
        "[generateManimScript] Visual gaps in the scene plan",
        visualGaps,
      );
      generationPromptParts.push(
        `VISUAL GAPS IN THE PLAN (fix these while keeping its beats and narration):\n- ${visualGaps.join("\n- ")}`,
      );
    }
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
      const enforced = enforceVoiceoverService(
        alignVoiceoverDurations(sanitized),
        detectedLanguage,
      );
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
  voiceoverScript?: string;
  scenePlan?: ScenePlanEntry[];
}

export async function generateVideoTitles({
  prompt,
  sessionId,
  voiceoverScript,
  scenePlan,
}: VideoTitleRequest): Promise<VideoTitleSet> {
  const systemPrompt = `You package videos for eduvids, a visual math and science channel. Your job is click-through rate: on a crowded home page, beside 3Blue1Brown, Veritasium and Welch Labs, a curious viewer must stop scrolling and click. Generate exactly three distinct title-and-thumbnail packages, ordered strongest first.

Each thumbnail pairs a short headline with one precise mathematical or scientific visual (matte 3D for surfaces and solids), on a flat near-black background. The renderer varies the composition across videos: text left, text right, or a poster with large art below a top headline. Design one clear focal image that works in these compositions. Copy is Computer Modern serif; one warm colour marks the payoff. There are no small tags or eyebrows on the image. You supply the words and the visual parameters only.

HOW TO WORK
1. Mine the source material for click fuel: the opening puzzle, the tempting wrong answer, the most surprising number, the payoff image, and any everyday object or stakes ("your phone", "a casino", "every bridge").
2. Brainstorm at least ten raw title ideas across different angles (wrong intuition, surprising number, impossible-sounding claim, hidden everyday connection, "what would happen if", a challenge to the viewer, a tiny change with a huge effect).
3. Score each idea silently: would a curious 15-year-old click it over the videos beside it? Is it specific? Does the video truly pay it off? Keep the three strongest, from different angles.

WHAT WINS THE CLICK
- The title and thumbnail are one sentence split in two: the image shows the strange thing, the title makes it matter. Never say the same thing twice.
- Open a curiosity gap the viewer can't close without watching, anchored to something concrete: a number, an object, a contradiction. "Why 23 People Is Enough" beats "The Birthday Problem".
- A strong title holds tension: a wrong intuition about to break ("Your Gut Says 50/50. It's Not."), something that sounds impossible but is true ("A Shape With Infinite Edge and Finite Area"), or stakes for the viewer ("The Math That Decides Your Medical Test").
- The promise must be paid off by THIS video. Read the narration: never promise a result it does not deliver. No fake mystery, no exaggeration of the claim.
- Concrete beats abstract; specific numbers beat vague words; the viewer's own intuition is the best villain.

TITLE RULES
- Write titles in the same language as the narration. Generate viewer-facing titles, never copy prompt instructions, title-slide labels or scene directions. Use complete phrases without wrapping quotes or parentheses.
- 30-55 characters is ideal and 70 the hard ceiling. Put the hook in the first 40 characters, because mobile truncates.
- Plain words a curious 15-year-old would use. Name the topic keyword once, naturally, in at least one of the three titles.
- Three DIFFERENT angles, in this order:
  A. The hook: the video's opening puzzle, surprising number or impossible-sounding claim ("Why the Slope at a Single Point Isn't a Paradox").
  B. The search title: the clearest phrasing someone would actually type, made intriguing ("What a Derivative Actually Measures").
  C. The bold claim or broken intuition: a confident, specific, true statement ("Every Sound Is Secretly a Sum of Circles").
- Title case. No ALL CAPS words, no emoji, no colon subtitles, no "| eduvids".
- Never use: Explained, Basics, Introduction, Lesson, Tutorial, Ultimate, Mind-Blowing, Insane, You Won't Believe, Finally Makes Sense, Visualized, Simple Guide, Everything You Need.

THUMBNAIL COPY RULES
- eyebrow: the field in 1-3 words, e.g. "Calculus", "Complex numbers", "Machine learning". It is metadata for picking the visual and is never drawn.
- headline: 2-5 words, at most 26 characters, sentence case, no final period. Short copy is set much larger, and on a phone that is what reads, so cut every word you can. It completes the title's thought, never repeats it: the insight, the verdict or the tension. "The slope is the height", "Multiplying by $i$ turns", "Probably not sick", "Always switch".
- accent: the exact substring of the headline that carries the payoff (1-2 words or one $math$ token). It is painted in the warm colour that also marks the focal detail of the visual, so pick the word the picture proves.
- Strike and callout are OPTIONAL. Default to empty strings. Use a strike only for an explicit misconception in the narration; a callout only when it identifies a detail the viewer would otherwise miss. Do not manufacture a correction or repeat the same device across all videos.
- strike (optional): one word, number or $math$ token of the headline drawn crossed out, as the wrong intuition the video corrects. The headline then reads as a correction: headline "50% 67%" with strike "50%", or "Not 99% sure" with strike "99%". Use it only for a specific wrong belief corrected in the narration; it must not be the accent. Otherwise "".
- callout: 1-3 words or one $math$ token placed beside the visual, with a warm arrow pointing at its focal detail: "why?", "still 1", "$\\infty$ edge", "a copy". Use it sparingly, pointing at a specific surprise; never restate the headline. Otherwise "".
- The three packages deliberately differ in copy so the channel learns what works:
  A: a headline that states the tension or insight; let the picture carry it without extra devices when possible.
  B: headline, accent, strike and callout are all empty strings. This thumbnail is visual-only, so choose the single most arresting image the video has; the picture alone must stop the scroll.
  C: a headline phrased as a short question or verdict ("Where did $0/0$ go?", "Probably not sick").
- Inline math goes between $...$ (e.g. "$e^{i\\pi}$", "$a^2+b^2=c^2$"). Use "~" only inside a multi-word term that must never be split across lines, e.g. "bell~curve"; most headlines need none.

VISUAL RULES
- Visual first: the picture is the hook and the words serve it. Pick the image that makes a viewer ask "wait, what?": the strange shape, the impossible number, the moment two things diverge. A plain plot of the topic is the last resort, not the default.
- Use the video's own pictures: the SCENE PLAN's opening hook, its correction beat and its payoff (big numbers, signature visuals, the struck guess) are what the viewer will see in the first seconds, so the click is paid off at once. Prefer a visual type that matches one of them; prefer spiral, chaos, fractal, bars and number whenever the video really shows that picture.
- visual.type is exactly one of: function_plot, complex_plane, geometry, transformation, vector_field, wave, orbit, probability, network, atom, energy_levels, surface_3d, solid_3d, equation, spiral, chaos, fractal, bars, number, fission, molecule, packet_flow
- Parameters by type (omit any you are unsure of; sensible defaults are used):
  function_plot: expression (single variable x; numbers, + - * / ^, parentheses, sin cos tan exp log sqrt abs, pi), xRange [min, max] within -20..20, highlight "tangent" | "area" | "point", at (x of the tangent or point), from and to (x bounds of a shaded area), notation (short LaTeX label such as "f(x)=e^x")
  complex_plane: turn (fraction of a full rotation, 0.25 = multiply by i, 0.5 = multiply by -1), notation
  geometry: shape "pythagoras" | "inscribed_polygon" | "triangle_angles" | "venn", sides (for inscribed_polygon), notation
  transformation: matrix [[a, b], [c, d]] with entries in -3..3
  vector_field: field "rotation" | "source" | "saddle" | "spiral"
  wave: shape "square" | "sawtooth", harmonics 2-6 (drawn as Fourier epicycles)
  orbit: eccentricity 0.1-0.85
  probability: from and to (shaded interval of a normal curve in standard deviations), notation
  network: layers, e.g. [3, 5, 5, 2]
  fission: a schematic heavy nucleus splitting into two fragments and releasing neutrons, without isotope counts (use for nuclear fission, never an orbital atom icon)
  molecule: shape "water" (bent H2O with a 104.5 degree bond angle) | "carbon_dioxide" (linear CO2); use only for these molecules, never a generic atom for a molecular geometry video
  packet_flow: packets traversing a shared link with a visible queue; use for internet routing, bandwidth and congestion, never a neural-network diagram
  atom: schematic electron orbits; only for atomic structure, never molecular bonds or nuclear reactions
  energy_levels: two energy levels, a downward transition and an emitted photon; use for quantum emission or luminescence (no extra parameters)
  surface_3d: expression in x and y, e.g. "sin(x)*cos(y)"
  solid_3d: shape "sphere" | "torus" | "cube"
  equation: notation (the formula is the hero; wrap the key term in \\hl{...} to colour only that term in the cool visual colour, distinct from the warm headline accent; never wrap the whole formula). Beside a headline keep it under about 20 characters, e.g. "P(A\\mid B)" rather than the whole rule; a visual-only package can show a longer formula
  spiral: shape "golden" (Fibonacci squares under the golden spiral: the golden ratio, Fibonacci, growth in nature) | "primes" (every prime p plotted at radius p and angle p, which falls into spiral arms: primes, hidden order in number theory)
  chaos: shape "lorenz" (the butterfly attractor, two starts a hair apart peeling away: chaos, weather, sensitive dependence) | "pendulum" (two double pendulums released almost identically, now far apart)
  fractal: shape "sierpinski" (zero area, a smaller copy highlighted) | "koch" (snowflake: infinite perimeter, finite area) | "tree" (recursive branching)
  bars: values (2-12 non-negative numbers taken from the source, in order, e.g. Benford's leading-digit percentages), focus (index of the surprising bar), labels (optional: one name of at most 10 letters per bar, e.g. ["stay", "switch"]; at most about 5 bars when labelled)
  number: value (the giant figure the video lands on, at most 9 characters of digits and % . , / : = ? × ≈ ∞, e.g. "67%", "1/3", "23"), was (optional: the intuitive wrong figure, drawn small and crossed out above it, e.g. "50%"). Use when one number IS the surprise
- notation must be short valid LaTeX that is central to the topic, or omitted. Never invent equations, numbers, data or claims: ground every expression, value and label in the source material. If exact mathematics is absent, choose a truthful conceptual visual
- Prefer a striking diagram over a formula when the diagram proves the headline. For continuous probability and area under a curve, choose probability or function_plot with an area highlight; do not substitute a discrete probability formula. For overlapping sets choose geometry with shape "venn"
- Use at most one short notation label. No explanatory captions, worked examples or small legends in the hero
- Make the three packages distinct in angle, headline, and visual. Vary title openings, avoid defaulting every title to "Why", and never copy a production instruction, scene description or the raw request as a title. Treat the request as a brief; the narration is the source of truth.

Return ONLY a JSON object: {"ideas": [ten or more short raw title ideas], "packages": [three objects, strongest first, with keys title, eyebrow, headline, accent, strike, callout, visualConcept (one sentence describing the image), visual (object with type and its parameters)]}. JSON strings must escape backslashes, e.g. "$e^{i\\\\pi}$".`;

  const sourceMaterial = [
    voiceoverScript ? `NARRATION:\n${voiceoverScript.slice(0, 8_000)}` : "",
    scenePlan
      ? `SCENE PLAN:\n${JSON.stringify(
          scenePlan.map(({ sceneId, narration, visualType, elements }) => ({
            sceneId,
            narration,
            visualType,
            elements,
          })),
        ).slice(0, 10_000)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const userPrompt = `Generate three title-and-thumbnail pairs for this animated educational video: "${prompt}"${
    sourceMaterial ? `\n\nSOURCE MATERIAL:\n${sourceMaterial}` : ""
  }`;

  const googleModel = await createGoogleModel("gemini-3.8-flash");
  const model = maybeWithTracing(googleModel.provider(googleModel.modelId), {
    posthogProperties: { $ai_session_id: sessionId },
  });

  return generateValidatedMetadata(
    (feedback, abortSignal) =>
      streamTextWithTracking(
        {
          model,
          abortSignal,
          system: systemPrompt,
          prompt: userPrompt + feedback,
          temperature: 0.8,
        },
        googleModel,
      ),
    (text) => {
      const titles = parseVideoTitleSet(text);
      if (
        !titles.thumbnailConcepts ||
        !titles.thumbnailConcepts[0].headline ||
        !titles.thumbnailConcepts[2].headline
      ) {
        throw new Error(
          "All three packages need supported visual concepts; A and C need short, valid headlines",
        );
      }
      for (const { visual } of titles.thumbnailConcepts) {
        if (
          (visual.type === "equation" && !visual.notation) ||
          (visual.type === "number" && !visual.value) ||
          (visual.type === "molecule" && !visual.shape)
        ) {
          throw new Error(
            "Equation, number and molecule visuals need valid source-grounded notation, a value or a supported molecule shape",
          );
        }
      }
      return titles;
    },
  );
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
}: VideoDescriptionRequest): Promise<VideoDescriptionPackage> {
  const systemPrompt = `You package videos for eduvids, a minimal, beautifully animated math and science channel. Write the top of a YouTube description plus discovery metadata.

HOOK (two lines; this is all most viewers see before "...more", and line 1 appears in search results)
- Line 1, under 110 characters: the video's opening puzzle or surprising claim, phrased differently from the title and grounded in the narration.
- Line 2, under 160 characters: the concrete thing the viewer will see and understand, naming the running example and 1-2 precise topic keywords.
- Plain, confident words. Never start with "In this video". Never use "dive into", "join us", "embark", "unlock", "journey", "fascinating", or "mind-blowing".
- Write in the narration's language. Start each line with a capital letter and finish a complete sentence with punctuation. Rewrite a sentence to fit its limit; never clip it.
- No links, calls to action, timestamps, emoji, labels, production instructions or scene directions. Summarize what the narration actually teaches; do not repeat the request. Do not invent claims or promise examples absent from the narration.

HASHTAGS: 2-3 specific topic hashtags in CamelCase, from broad to specific (e.g. "#Math", "#Calculus", "#Derivatives"). No generic tags like #Education or #Learning.
TAGS: 6-10 search phrases people would actually type to find this video (e.g. "what is a derivative", "derivative intuition").

Return ONLY JSON: {"hook": ["line 1", "line 2"], "hashtags": ["#A", "#B"], "tags": ["phrase", "phrase"]}`;

  const userPrompt = `Package this ${
    variant === "short" ? "vertical short" : "video"
  }.

TOPIC: ${prompt}

VOICEOVER SCRIPT:
${voiceoverScript}`;

  const googleModel = await createGoogleModel("gemini-3.5-flash-lite");
  const model = maybeWithTracing(googleModel.provider(googleModel.modelId), {
    posthogProperties: { $ai_session_id: sessionId },
  });

  return generateValidatedMetadata(
    (feedback, abortSignal) =>
      streamTextWithTracking(
        {
          model,
          abortSignal,
          system: systemPrompt,
          prompt: userPrompt + feedback,
          temperature: 0.5,
        },
        googleModel,
      ),
    parseVideoDescriptionPackage,
  );
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
  let updated = alignVoiceoverDurations(script);
  const notes: string[] =
    updated === script ? [] : ["closed voiceover blocks with the aligned wait"];

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
