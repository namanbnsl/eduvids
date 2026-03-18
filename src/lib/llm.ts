import {
  MANIM_SYSTEM_PROMPT,
  VOICEOVER_SYSTEM_PROMPT,
  SCENE_PLAN_SYSTEM_PROMPT,
} from "@/prompt";
import { generateText, streamText, LanguageModel } from "ai";
import {
  createGoogleProvider,
  reportSuccess,
  reportError,
} from "./google-provider";
import { queryManimDocs } from "./deepwiki";

import { jsonrepair } from "jsonrepair";
import { franc } from "franc";

// @ts-expect-error langs has no types
import langs from "langs";

import { withTracing } from "@posthog/ai";
import { PostHog } from "posthog-node";

interface GoogleModelConfig {
  modelId: string;
  provider: Awaited<ReturnType<typeof createGoogleProvider>>;
}

const isDev = process.env.NODE_ENV !== "production";

// Only initialize PostHog in production
const phClient = isDev
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

async function streamTextWithTracking<
  T extends Parameters<typeof streamText>[0],
>(
  config: T & { model: LanguageModel },
  googleConfig?: GoogleModelConfig,
): Promise<string> {
  try {
    const result = streamText(config);
    const text = await result.text;

    if (googleConfig) {
      reportSuccess(googleConfig.provider);
    }

    return text;
  } catch (error) {
    if (googleConfig) {
      reportError(googleConfig.provider, error);
    }

    throw error;
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

export interface VoiceoverScriptRequest {
  prompt: string;
  sessionId: string;
}

export interface ManimScriptRequest {
  prompt: string;
  voiceoverScript: string;
  sessionId: string;
  scenePlan?: ScenePlanEntry[];
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
}

const SCENE_PLAN_MAX_RETRIES = 3;

export async function generateScenePlan({
  prompt,
  voiceoverScript,
  sessionId,
}: ManimScriptRequest): Promise<ScenePlanEntry[]> {
  const composedPrompt = `User request: ${prompt}\n\nVoiceover narration:\n${voiceoverScript}`;

  let lastError: unknown;

  for (let attempt = 0; attempt < SCENE_PLAN_MAX_RETRIES; attempt++) {
    const googleModel = await createGoogleModel("gemini-3-flash-preview");
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
      return parsed;
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

  const googleModel = await createGoogleModel("gemini-3.1-flash-lite-preview");

  const { text } = await generateText({
    model: maybeWithTracing(googleModel.provider(googleModel.modelId), {
      posthogProperties: { $ai_session_id: sessionId },
    }),
    system: systemPrompt,
    prompt: composedPrompt,
    temperature: 0.5,
  });

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
  result = result.replace(/<\/?[a-zA-Z][^>]*>/g, "");

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
  let parenStack: string[] = [];
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

const MANIM_SCRIPT_MAX_RETRIES = 3;

export async function generateManimScript({
  prompt,
  voiceoverScript,
  sessionId,
  scenePlan,
}: ManimScriptRequest): Promise<string> {
  // Detect language from voiceover script using LLM
  const detectedLanguage = await detectLanguage(voiceoverScript);
  console.log(`Detected language: ${detectedLanguage}`);

  // Build system prompt with language adjustments
  const augmentedSystemPrompt = buildAugmentedSystemPrompt(
    MANIM_SYSTEM_PROMPT,
    detectedLanguage,
  );

  const generationPromptParts = [
    `User request: ${prompt}`,
    `Voiceover narration:\n${voiceoverScript}`,
    `Generate a complete Manim script as MULTIPLE ORDERED SCENE CLASSES (6-14 for videos, 4-8 for shorts). One concept per scene. Each scene is self-contained.`,
    `Use the layout templates from the system prompt.`,
  ];

  if (scenePlan) {
    generationPromptParts.push(
      `SCENE PLAN (follow this structure exactly):\n${JSON.stringify(scenePlan, null, 2)}`,
    );
  }

  const generationPrompt = generationPromptParts.join("\n\n");

  let lastError: unknown;

  for (let attempt = 0; attempt < MANIM_SCRIPT_MAX_RETRIES; attempt++) {
    const googleModel = await createGoogleModel("gemini-3-flash-preview");
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
        },
        googleModel,
      );

      const code = text
        .replace(/```python?\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();

      return sanitizeManimScript(code);
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
  return "Script Generation Failed";
}

// ---------------------------------------------------------------------------
// YouTube title generation
// ---------------------------------------------------------------------------

export interface VideoTitleRequest {
  prompt: string;
  sessionId: string;
}

export async function generateVideoTitle({
  prompt,
  sessionId,
}: VideoTitleRequest): Promise<string> {
  const systemPrompt = `You are a YouTube title expert. Generate a single catchy, concise video title.

RULES:
- Maximum 80 characters
- No quotes around the title
- Make it engaging and descriptive
- Use title case
- Output ONLY the title text, nothing else`;

  const userPrompt = `Generate a YouTube title for a math/science animation video about: "${prompt}"`;

  const googleModel = await createGoogleModel("gemini-3.1-flash-lite-preview");
  const model = maybeWithTracing(googleModel.provider(googleModel.modelId), {
    posthogProperties: { $ai_session_id: sessionId },
  });

  const text = await streamTextWithTracking(
    {
      model,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.7,
    },
    googleModel,
  );

  return text
    .trim()
    .replace(/^["']|["']$/g, "")
    .slice(0, 80);
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
  const systemPrompt = `You are a YouTube description expert for educational math/science videos.

RULES:
- Maximum 900 characters
- 1-2 short paragraphs
- Plain text only (no lists or timestamps)
- No quotes around the description
- Do not include calls-to-action or links
- Output ONLY the description text, nothing else`;

  const userPrompt = `Create a YouTube description for this ${
    variant === "short" ? "vertical short" : "video"
  }.

TOPIC: ${prompt}

VOICEOVER SCRIPT:
${voiceoverScript}`;

  const googleModel = await createGoogleModel("gemini-3.1-flash-lite-preview");
  const model = maybeWithTracing(googleModel.provider(googleModel.modelId), {
    posthogProperties: { $ai_session_id: sessionId },
  });

  const text = await streamTextWithTracking(
    {
      model,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.6,
    },
    googleModel,
  );

  return text
    .trim()
    .replace(/^["']|["']$/g, "")
    .slice(0, 900);
}

// ---------------------------------------------------------------------------
// Thumbnail HTML generation
// ---------------------------------------------------------------------------

export interface ThumbnailHtmlRequest {
  prompt: string;
  sessionId: string;
  variant?: "video" | "short";
}

export async function generateThumbnailHtml({
  prompt,
  sessionId,
  variant,
}: ThumbnailHtmlRequest): Promise<string> {
  const systemPrompt = `You are a world-class editorial designer creating YouTube thumbnails for a premium math/science education channel. Generate HTML markup rendered to a 1280×720 PNG via Satori.

CRITICAL SATORI CONSTRAINTS:
- ONLY inline styles (style attribute). NO <style> tags, CSS classes, or selectors.
- Flexbox ONLY layout. Every container defaults to display:flex. No grid/float/table.
- camelCase CSS in style attributes (e.g. fontSize: 72px; fontWeight: 700).
- Allowed elements: div, span, p, img, svg, path. NO html/head/body/h1/h2/etc.
- Root MUST be: <div style="width: 1280px; height: 720px; display: flex; ...">
- Fonts available: "Lexend" (weights: 400, 700) for text, "Noto Sans Math" (weight: 400) for math symbols. Set fontFamily: "Lexend" on root. For elements containing math Unicode symbols (∞, Σ, ∫, √, Δ, φ, θ, π, etc.), set fontFamily: "Noto Sans Math, Lexend" on that element.
- Supported CSS: flexbox props, position (relative/absolute), color, background, backgroundImage (linear-gradient), padding, margin, border, borderRadius, fontSize, fontWeight, fontStyle, lineHeight, letterSpacing, textAlign, textTransform, textShadow, opacity, overflow, boxShadow, filter, objectFit.
- NOT supported: z-index (use DOM order), calc(), animations, transitions, pseudo-elements.
- NO <script>, @import, or external URLs.

DESIGN DIRECTION — AVOID GENERIC AI AESTHETICS:
You must NOT produce the typical AI thumbnail look. That means:
- NO dark purple/blue backgrounds with neon cyan/pink accents.
- NO generic "glowing orbs" floating around. NO generic gradient blobs.
- NO pill-shaped category badges. NO thin gradient accent lines at the bottom.
- NO cookie-cutter layouts with text-left, floating-symbol-right.

Instead, design like a real human editorial designer with INTENTIONAL choices:

COLOR PALETTES — pick ONE per thumbnail and commit fully:
  • Warm editorial: cream (#F5F0E8) background, charcoal (#1C1917) text, burnt sienna (#C2410C) accent
  • Bold contrast: pure black (#000000) background, stark white text, single vivid accent (pick ONE: vermillion #E53935, emerald #059669, amber #D97706)
  • Muted sophistication: slate (#334155) background, warm white (#FAFAF9) text, muted gold (#B45309) accent
  • Scientific paper: off-white (#FEFCE8) background, deep navy (#1E293B) text, oxide red (#991B1B) accent
  • Chalkboard: dark forest green (#14532D) background, chalk white text, pale yellow (#FDE68A) highlight
  • High contrast modern: deep ink (#0F172A) background, crisp white text, single saturated accent
  Do NOT default to the same palette every time. Pick based on the topic's mood.

TYPOGRAPHY — THIS IS CRITICAL FOR READABILITY:
- Headline: 64-84px, fontWeight: 700. Let the text BE the design — fill the frame.
- Maximum 2-5 words. Rewrite the prompt into a provocative question or bold claim.
- letterSpacing MUST be between 0px and 3px. NEVER use negative letterSpacing — it smashes letters together and makes text unreadable.
- lineHeight: use 1.1 to 1.2 so lines don't overlap.
- Put EACH WORD in its own <span> or <div> so words are clearly separated. Add spacing between words.
- Consider ALL-CAPS for impact or mixed-case for elegance — vary per topic.

POSITIONING & ACCURACY — THIS IS CRITICAL:
- DO NOT use complex overlapping positioned elements. Keep layouts simple and predictable.
- If you place a label (like "A", "B", "C", ∠, etc.) next to a geometric shape, the label MUST be visually adjacent to the correct vertex/edge. Use flexbox alignment (alignItems, justifyContent) to position labels — NOT absolute positioning with guessed pixel values.
- DO NOT place angle symbols or labels at random positions. If you show an angle, the ∠ symbol must be AT the angle's vertex.
- Prefer simple, bold compositions over intricate diagrams. A large symbol + bold text is better than a complex geometric diagram with misplaced labels.
- When showing geometric shapes (triangles, circles, etc.), keep them simple and decorative. Do NOT try to create precise technical diagrams with labeled vertices — Satori's layout makes this unreliable. Instead, use shapes as large background/accent elements.

COMPOSITION — vary these approaches:
  • Full-bleed typography: Text fills 70%+ of the frame. Minimal decoration. Let whitespace breathe.
  • Asymmetric split: Strong color block division. Content on one side, bold color/shape on the other.
  • Centered monumental: One large symbol or equation dead center, text above/below in smaller size.
  • Overlapping layers: 2-3 large simple shapes with text in front.

VISUAL ELEMENTS — keep it simple and bold:
- ONE or TWO large Unicode math symbols (∞, Σ, ∫, √, Δ, φ, θ, π, ∠) rendered at 200-400px as decorative background elements. IMPORTANT: always set fontFamily: "Noto Sans Math, Lexend" on elements containing these symbols.
- Simple geometric shapes: circles, rectangles, triangles using border/borderRadius — as accent elements only, NOT as technical diagrams.
- Simple SVG <path> curves (sine wave, parabola) as decorative accents — keep path data short and simple.
- Use opacity (0.1-0.3) on decorative elements so they don't compete with the headline text.
- Prefer clean lines and solid shapes over gradients and glows.

WHAT NOT TO DO:
- Do NOT create complex geometric diagrams with multiple labeled points/vertices.
- Do NOT use absolute positioning with guessed pixel values for labels — they WILL be wrong.
- Do NOT try to show precise mathematical relationships visually (angle measures, side lengths) — just suggest the topic.
- Do NOT crowd the thumbnail with many small elements. Less is more.

CRITICAL: Every thumbnail must look like it was designed by a human with taste. Think Vox, NYT graphics, Nature journal covers. The thumbnail should suggest the topic at a glance — it does NOT need to be a technical diagram.
${variant === "short" ? "- This is for a YouTube Short. Make the thumbnail extra bold and punchy." : ""}

OUTPUT ONLY THE RAW HTML. No markdown fences, no backticks, no commentary.`;

  const userPrompt = `Create a stunning, scroll-stopping YouTube thumbnail for an educational math/science video about: "${prompt}"

Design a unique visual concept that captures the essence of this topic. Use relevant mathematical symbols, geometric shapes, or scientific visual motifs built with HTML/SVG elements.`;

  const googleModel = await createGoogleModel("gemini-3.1-flash-lite-preview");
  const model = maybeWithTracing(googleModel.provider(googleModel.modelId), {
    posthogProperties: { $ai_session_id: sessionId },
  });

  const text = await streamTextWithTracking(
    {
      model,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.9,
    },
    googleModel,
  );

  let html = text
    .replace(/```html?\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  // Validate: reject scripts, external URLs, @import, <style> tags
  if (/<script/i.test(html) || /@import/i.test(html) || /<style[\s>]/i.test(html)) {
    console.warn("[generateThumbnailHtml] LLM output contained forbidden elements, using fallback");
    html = buildFallbackThumbnailHtml(prompt);
  }

  // Remove any http/https URLs that slipped through
  html = html.replace(/https?:\/\/[^\s"'<>]+/g, "");

  // Satori requires every element with multiple children to have explicit
  // display: flex | contents | none.  LLM output sometimes misses this on
  // inner divs.  Inject "display:flex" into any <div style="..."> that lacks it.
  html = html.replace(
    /<div\s+style="((?!display\s*:)[^"]*)"/gi,
    '<div style="display:flex;$1"',
  );

  return html;
}

function buildFallbackThumbnailHtml(prompt: string): string {
  const headline = prompt.length > 50 ? prompt.slice(0, 47) + "..." : prompt;
  return `<div style="width: 1280px; height: 720px; display: flex; position: relative; overflow: hidden; fontFamily: Lexend; background: #0F172A;">
  <div style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; display: flex; background: linear-gradient(160deg, #0F172A 0%, #1E293B 100%);"></div>
  <div style="position: absolute; bottom: 60px; right: 80px; width: 320px; height: 320px; borderRadius: 50%; border: 2px solid rgba(255,255,255,0.06); display: flex;"></div>
  <div style="position: absolute; bottom: 120px; right: 140px; width: 200px; height: 200px; borderRadius: 50%; border: 2px solid rgba(255,255,255,0.04); display: flex;"></div>
  <div style="display: flex; flexDirection: column; justifyContent: center; width: 100%; height: 100%; padding: 80px 100px; position: relative;">
    <div style="color: #94A3B8; fontSize: 20px; fontWeight: 400; letterSpacing: 4px; textTransform: uppercase; marginBottom: 32px; display: flex;">Explained</div>
    <div style="color: #FAFAF9; fontSize: 76px; fontWeight: 700; lineHeight: 0.95; letterSpacing: -1px;">${headline}</div>
    <div style="display: flex; marginTop: 40px;"><div style="width: 60px; height: 3px; background: #E53935;"></div></div>
  </div>
</div>`;
}

// ---------------------------------------------------------------------------
// Script fixer – diff-based error correction via gemini-3.1-flash-lite
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
}

export async function fixManimScript({
  script,
  errors,
  sessionId,
}: FixManimScriptRequest): Promise<string> {
  const heuristicFixed = fixManimScriptHeuristically(script, errors);
  if (heuristicFixed.changed) {
    console.warn(
      "[fixManimScript] Applied heuristic fix before LLM:",
      heuristicFixed.notes.join("; "),
    );
    return heuristicFixed.script;
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

  console.log(userPrompt);

  const googleModel = await createGoogleModel("gemini-3-flash-preview");
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

    console.log(text.trim());
    const fixed = applySearchReplaceDiffs(script, text.trim());
    if (fixed !== script) return fixed;

    const heuristicAfter = fixManimScriptHeuristically(script, errors);
    if (heuristicAfter.changed) {
      console.warn(
        "[fixManimScript] Applied heuristic fix after LLM:",
        heuristicAfter.notes.join("; "),
      );
      return heuristicAfter.script;
    }

    return script;
  } catch (err) {
    console.error("[fixManimScript] LLM call failed:", err);
    // Return original script so the caller can decide whether to retry
    const heuristicAfter = fixManimScriptHeuristically(script, errors);
    if (heuristicAfter.changed) {
      console.warn(
        "[fixManimScript] Applied heuristic fix after LLM failure:",
        heuristicAfter.notes.join("; "),
      );
      return heuristicAfter.script;
    }
    return script;
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
  if (/has no attribute 'fix_in_frame'/.test(errors) || /fix_in_frame/.test(updated)) {
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
      notes.push(`replaced ${varName}.fix_in_frame() with self.add_fixed_in_frame_mobjects(${varName})`);
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

  const googleModel = await createGoogleModel("gemini-3.1-flash-lite-preview");
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
    const { text } = await generateText({
      model,
      system: systemPrompt,
      messages: [{ role: "user", content }],
      temperature: 0.2,
    });

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
