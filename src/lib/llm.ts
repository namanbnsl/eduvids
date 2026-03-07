import { MANIM_SYSTEM_PROMPT, VOICEOVER_SYSTEM_PROMPT } from "@/prompt";
import { generateText, streamText, LanguageModel } from "ai";
import {
  createGoogleProvider,
  reportSuccess,
  reportError,
} from "./google-provider";
import { selectGroqModel, GROQ_MODEL_IDS } from "./groq-provider";

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

// Retry helpers for Gemini calls
const SLEEP_MIN_MS = 30_000;
const SLEEP_MAX_MS = 40_000;
const GEMINI_MAX_RETRIES = 3;

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
const randomDelayMs = () =>
  SLEEP_MIN_MS + Math.floor(Math.random() * (SLEEP_MAX_MS - SLEEP_MIN_MS + 1));

const logRetry = (
  fnName: string,
  attempt: number,
  error: unknown,
  delayMs?: number,
) => {
  const errorMsg = error instanceof Error ? error.message : String(error);
  console.warn(
    `[${fnName}] Attempt ${attempt + 1}/${
      GEMINI_MAX_RETRIES + 1
    } failed: ${errorMsg}${
      delayMs
        ? ` - retrying in ${Math.round(delayMs / 1000)}s`
        : " - no more retries"
    }`,
  );
};

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

    // 1. Replace the main LaTeX requirement line
    modifiedBase = modifiedBase.replace(
      /- \*\*ALL ON-SCREEN TEXT MUST BE LATEX\*\*: Use Tex\/MathTex via the provided helpers \(create_tex_label, create_text_panel\)\. NEVER use Text, MarkupText, or Paragraph directly\./g,
      `- **FOR ${langUpper} TEXT, USE Text() INSTEAD OF LATEX**: LaTeX does not properly support ${language} characters. For all non-mathematical text, use the Text() class directly: Text("your text", font_size=FONT_BODY, color=WHITE). ONLY use Tex/MathTex for mathematical formulas and equations. Never use create_tex_label for ${language} text.`,
    );

    // 2. Modify all create_tex_label references to suggest Text() for non-English
    modifiedBase = modifiedBase.replace(
      /create_tex_label\(/g,
      `Text(  # For ${language}, use Text() instead of create_tex_label(`,
    );

    // 3. Add a prominent section at the beginning about non-English text handling
    const nonEnglishHeader = `
⚠️ CRITICAL - ${langUpper} LANGUAGE DETECTED ⚠️
This video is in ${language.toUpperCase()}. IMPORTANT RULES:
1. **USE Text() FOR ALL NON-MATHEMATICAL TEXT**: Text("your text", font_size=FONT_BODY, color=WHITE, font=DEFAULT_FONT)
2. **USE Tex/MathTex ONLY FOR MATH**: MathTex(r"E = mc^2", font_size=FONT_MATH)
3. **ALWAYS use font=DEFAULT_FONT (Latin Modern Roman)** for consistent, professional typography
4. **NEVER use create_tex_label, create_text_panel, or create_bullet_item for ${language} text**
5. **For bullets in ${language}**: Create Text() objects and arrange them manually
6. **Example correct usage**:
   title = Text("${
     language === "spanish"
       ? "Título"
       : language === "french"
         ? "Titre"
         : language === "german"
           ? "Titel"
           : "Title"
   }", font_size=FONT_TITLE, color=WHITE, font=DEFAULT_FONT)
   body = Text("${
     language === "spanish"
       ? "Contenido"
       : language === "french"
         ? "Contenu"
         : language === "german"
           ? "Inhalt"
           : "Content"
   }", font_size=FONT_BODY, color=WHITE, font=DEFAULT_FONT)
7. **LaTeX will NOT work for ${language} characters** - it will show garbled text or errors

`;

    modifiedBase = nonEnglishHeader + modifiedBase;

    // 4. Modify bullet point creation instructions
    modifiedBase = modifiedBase.replace(
      /\*\*RECOMMENDED:\*\* Use the \\`create_bullet_list\\` helper function for safe, consistent bullet points/g,
      `**FOR ${langUpper}**: DO NOT use create_bullet_list - it uses LaTeX which doesn't support ${language}. Instead, create Text() objects and arrange them vertically`,
    );

    // 5. Update text panel instructions
    modifiedBase = modifiedBase.replace(
      /create_text_panel\(/g,
      `# For ${language}, manually create Text() + Rectangle instead of create_text_panel(`,
    );
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
}

export async function generateVoiceoverScript({
  prompt,
  sessionId,
}: VoiceoverScriptRequest): Promise<string> {
  const systemPrompt = VOICEOVER_SYSTEM_PROMPT;

  const composedPrompt = [
    `User request: ${prompt}`,
    `Use the language that is asked for and output text in that script`,
    "Directive: Cover every essential idea from the request in sequence, adding as many explanatory lines as needed so no core step is skipped.",
    "Directive: Keep the narration purely educational—no jokes, sound effects, or entertainment filler.",
    "Directive: Focus on a single clearly defined topic drawn from the user request—do not introduce unrelated hooks, metaphors, or tangents.",
    "Directive: Start with an engaging hook that immediately connects to the topic and states the learning objective; avoid vague rhetorical questions that are never answered.",
    "Directive: Develop each explanation with concrete definitions, reasoning, and worked steps so the listener learns how and why—not just what.",
    "Directive: Ensure the worked example and reflection lines explicitly reference the same core concept and build on prior steps.",
    "Directive: Maintain smooth flow by referencing prior steps and previewing what comes next.",
    "Directive: Do NOT force a fixed section template. Write a natural teaching flow that would help a complete beginner understand the topic end-to-end.",
    "Directive: Explain enough detail to be truly educational: define terms, show why steps are valid, and include concrete examples or counterexamples when useful.",
    "Directive: When you mention an acronym, initialism, or all-caps mnemonic, write ONLY the phonetic pronunciation in lowercase without showing the uppercase form or parentheses, so TTS reads it naturally once (e.g., write 'soah caah toa' instead of 'SOH CAH TOA', write 'dee en ay' instead of 'DNA'). For well-known acronyms that TTS handles correctly (like 'NASA' or 'FBI'), you may use the standard form.",
    "Draft the narration voiceover:",
  ].join("\n\n");

  const model = selectGroqModel(GROQ_MODEL_IDS.gptOss);

  const { text } = await generateText({
    model: maybeWithTracing(model, {
      posthogProperties: { $ai_session_id: sessionId },
    }),
    system: systemPrompt,
    prompt: composedPrompt,
    temperature: 0.5,
  });

  return text.trim();
}

export async function generateManimScript({
  prompt,
  voiceoverScript,
  sessionId,
}: ManimScriptRequest): Promise<string> {
  // Detect language from voiceover script using LLM
  const detectedLanguage = await detectLanguage(voiceoverScript);
  console.log(`Detected language: ${detectedLanguage}`);

  // Build system prompt with language adjustments
  const augmentedSystemPrompt = buildAugmentedSystemPrompt(
    MANIM_SYSTEM_PROMPT,
    detectedLanguage,
  );

  const generationPrompt = `User request: ${prompt}\n\nVoiceover narration:\n${voiceoverScript}\n\nGenerate the complete Manim script as MULTIPLE ORDERED SCENE CLASSES, not one giant scene. Split the narration into a sequence of focused scenes so that later each scene can be rerendered independently without redoing the whole video.

Scene planning requirements:
- Start a new scene whenever the explanation changes concept, example, or diagram
- Prefer more small scenes over fewer overloaded scenes
- Use ordered class names like Scene01Intro, Scene02Setup, Scene03WorkedExample
- Each scene must be self-contained and renderable on its own
- Keep visual continuity across scenes, but do not depend on prior scene state
- Return one Python file containing all scenes in order

Geometry and diagram accuracy requirements (always apply when relevant):
- Angle arcs must represent the intended angle region exactly (interior/reflex/acute/obtuse) and labels must match the highlighted region.
- Shared edges or touching polygons should have zero visual gap unless separation is explicitly requested.
- Adjacent or congruent shapes must preserve stated relationships (equal side lengths, equal angles, parallel/perpendicular markers).
- Place measurement labels outside shapes with clear pointers when needed; avoid ambiguous label placement.
- If a diagram could be ambiguous, add visual cues (ticks, right-angle markers, color-coded corresponding parts) before explaining conclusions.

Before finalizing each diagram, verify by code that positions and geometry reflect the narrated claim (not just approximate visuals).

3D quality and readability requirements:
- If the concept is inherently spatial, use real 3D constructs (e.g., ThreeDAxes, surfaces, Arrow3D) instead of flattening to 2D.
- Compose camera motion deliberately (stable orientation changes and purposeful reveals), not random spinning.
- For portrait shorts, prioritize legibility over density: keep fewer objects on screen and use large text constants only.`;

  for (let attempt = 0; attempt <= GEMINI_MAX_RETRIES; attempt++) {
    const googleModel = await createGoogleModel(
      "gemini-3.1-flash-lite-preview",
    );
    const model = maybeWithTracing(googleModel.provider(googleModel.modelId), {
      posthogProperties: { $ai_session_id: sessionId },
    });

    try {
      const text = await streamTextWithTracking(
        {
          model: model,
          system: augmentedSystemPrompt,
          prompt: generationPrompt,
          temperature: 1,
        },
        googleModel,
      );

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

  throw new Error("generateManimScript: all retries exhausted");
}
