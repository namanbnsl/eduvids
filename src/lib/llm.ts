import { MANIM_SYSTEM_PROMPT, VOICEOVER_SYSTEM_PROMPT } from "@/prompt";
import { generateText, streamText, LanguageModel } from "ai";
import {
  createGoogleProvider,
  reportSuccess,
  reportError,
} from "./google-provider";
import { selectGroqModel, GROQ_MODEL_IDS } from "./groq-provider";
import { RenderLogEntry, ValidationStage } from "@/lib/types";

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
const LLM_CALL_TIMEOUT_MS = 120_000; // 2 minute timeout per LLM call

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

const truncate = (value: string, max = 2000) => {
  if (!value) return "";
  return value.length > max
    ? `${value.slice(0, max)}\n...[truncated ${value.length - max} chars]`
    : value;
};

export interface VoiceoverScriptRequest {
  prompt: string;
  sessionId: string;
}

export interface ManimScriptRequest {
  prompt: string;
  voiceoverScript: string;
  sessionId: string;
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

  // // Using flash-lite for testing
  // for (let attempt = 0; attempt <= GEMINI_MAX_RETRIES; attempt++) {
  //   const googleModel = await createGoogleModel("gemini-3.1-flash-lite-preview");
  //   const model = maybeWithTracing(googleModel.provider(googleModel.modelId), {
  //     posthogProperties: { $ai_session_id: sessionId },
  //   });

  //   try {
  //     const text = await streamTextWithTracking(
  //       {
  //         model: model,
  //         system: augmentedSystemPrompt,
  //         prompt: generationPrompt,
  //         temperature: 1,
  //       },
  //       googleModel,
  //     );

  //     const code = text
  //       .replace(/```python?\n?/g, "")
  //       .replace(/```\n?/g, "")
  //       .trim();

  //     return code;
  //   } catch (err) {
  //     if (attempt === GEMINI_MAX_RETRIES) {
  //       logRetry("generateManimScript", attempt, err);
  //       throw err;
  //     }
  //     const delayMs = randomDelayMs();
  //     logRetry("generateManimScript", attempt, err, delayMs);
  //     await sleep(delayMs);
  //   }
  // }

  throw new Error("generateManimScript: all retries exhausted");
}

export async function generateYoutubeTitle({
  prompt,
  voiceoverScript,
  sessionId,
}: ManimScriptRequest) {
  const model = selectGroqModel(GROQ_MODEL_IDS.gptOss);

  const systemPrompt = `You are a YouTube title expert who writes highly clickable, engaging titles for educational math and science videos. Your titles should:
- Create curiosity and intrigue while staying truthful to the content
- Use power words that grab attention (e.g., "Why", "How", "The Secret", "Finally Explained", "Mind-Blowing")
- Make viewers feel like they'll miss out if they don't click
- Keep it under 80 characters
- Respond with only the final title—no quotes or extra text
- Angled brackets are not allowed
- Don't mention video duration

Examples of great titles:
- "Why Nobody Can Solve This Simple Math Problem"
- "The Equation That Stumped Einstein"
- "This One Trick Makes Calculus Click Instantly"
- "I Finally Understand Quantum Physics (And You Will Too)"`;
  const { text } = await generateText({
    model: maybeWithTracing(model, {
      posthogProperties: { $ai_session_id: sessionId },
    }),
    system: systemPrompt,
    prompt: `User request: ${prompt}\n\nVoiceover narration:\n${voiceoverScript}\n\nWrite an irresistible YouTube title that sparks curiosity, promises value, and makes viewers NEED to click. Use emotional hooks, create a knowledge gap, or pose an intriguing question. Stay under 80 characters:`,
    temperature: 0.5,
  });

  return text.trim();
}

export async function generateYoutubeDescription({
  prompt,
  voiceoverScript,
  sessionId,
}: ManimScriptRequest) {
  const model = selectGroqModel(GROQ_MODEL_IDS.gptOss);

  const systemPrompt = `You are a YouTube description expert who writes engaging, click-worthy descriptions for educational math and science videos. Your descriptions should:
- Start with a compelling hook in the first line (this shows in search results!)
- Create excitement about what viewers will learn
- Use conversational, enthusiastic language
- Include a subtle call-to-action encouraging likes/subscribes
- Keep it 2-4 short paragraphs
- Respond only with plain text
- Angled brackets, emojis, and hashtags are not allowed
- Don't mention video duration

Structure:
1. Hook line that makes them want to watch
2. What mind-blowing thing they'll understand
3. Why this matters or how it connects to bigger ideas
4. Soft CTA (e.g., "If this clicked for you, you'll love our other videos!")`;
  const { text } = await generateText({
    model: maybeWithTracing(model, {
      posthogProperties: { $ai_session_id: sessionId },
    }),
    system: systemPrompt,
    prompt: `User request: ${prompt}\n\nVoiceover narration:\n${voiceoverScript}\n\nWrite an engaging YouTube description that hooks viewers immediately, builds excitement about the concepts, and makes them eager to watch. Be conversational and enthusiastic without being cheesy:`,
    temperature: 0.5,
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
  sessionId: string;
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
  sessionId,
}: RegenerateManimScriptRequest): Promise<string> {
  // Detect language from voiceover script using LLM
  const detectedLanguage = await detectLanguage(voiceoverScript);
  console.log(`Detected language for regeneration: ${detectedLanguage}`);

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
        `STDERR (truncated to 2k chars):\n${errorDetails.stderr.slice(0, 2000)}`,
      );
    }
    if (errorDetails.stdout && errorDetails.stdout.trim().length > 0) {
      parts.push(
        `STDOUT (truncated to 2k chars):\n${errorDetails.stdout.slice(0, 2000)}`,
      );
    }
    if (errorDetails.stack && errorDetails.stack.trim().length > 0) {
      parts.push(
        `Stack (truncated to 2k chars):\n${errorDetails.stack.slice(0, 2000)}`,
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
    : (errorDetails?.message ?? "Unknown error");

  const blockedScriptsSection = (() => {
    if (!blockedScripts.length) return "";
    const unique = Array.from(
      new Map(
        blockedScripts.map((script) => {
          const trimmed = script.trim();
          return [trimmed, truncate(trimmed, 6000)];
        }),
      ).values(),
    );
    if (!unique.length) return "";
    const blocks = unique
      .map(
        (script, idx) => `--- Failed Script Variant #${idx + 1} ---\n${script}`,
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

  const regenerationPrompt = promptSections.join("\n\n");

  const regenerationSystemPrompt = `You are a Manim error-fixing expert. Fix all errors and generate a corrected Manim script. DO NOT CHANGE THE SCRIPT's INTENDED BEHAVIOR OR THE SEQUENCE OF VISUALS UNLESS NECESSARY TO RESOLVE THE ERROR.

═══════════════════════════════════════════════════════════════════════════════
MANDATORY REQUIREMENTS
═══════════════════════════════════════════════════════════════════════════════

1. OUTPUT MULTIPLE ORDERED SCENE CLASSES whenever the content naturally spans multiple beats
2. Every scene class must define construct(self) and be independently renderable
3. Prefer focused scene-local fixes over rewriting the whole file unless necessary
4. OUTPUT FORMAT: Pure Python code only. NO markdown fences, NO commentary, NO explanations.

═══════════════════════════════════════════════════════════════════════════════
SCREEN & SIZING CONSTRAINTS (14.2 x 8.0 Manim units)
═══════════════════════════════════════════════════════════════════════════════

SAFE BOUNDARIES:
- X: -6.5 to 6.5 (leave 0.6 unit margin on each side)
- Y: -3.5 to 3.5 (leave 0.5 unit margin top/bottom)

FONT SIZES (never exceed these):
- FONT_TITLE = 56  (titles only, never larger)
- FONT_HEADING = 46
- FONT_BODY = 40
- FONT_MATH = 44
- FONT_CAPTION = 32
- FONT_LABEL = 30

FONT FAMILY:
- DEFAULT_FONT = "Latin Modern Roman" (use for all Text() objects)
- Example: Text("Hello", font_size=FONT_BODY, font=DEFAULT_FONT)
- Or use create_label() which applies Latin Modern Roman automatically

ELEMENT LIMITS:
- Max 4 visible elements at once
- Max 3 bullet points per scene
- Max 40 characters per text line (use line breaks for longer text)
- Minimum buff=0.5 in all .next_to() calls

═══════════════════════════════════════════════════════════════════════════════
COMMON ERRORS TO FIX
═══════════════════════════════════════════════════════════════════════════════

1. OVERLAPPING ELEMENTS:
   - Never use move_to(ORIGIN) for multiple objects
   - Always use .next_to(other, DIRECTION, buff=0.5) for positioning
   - Place labels OUTSIDE shapes, not inside

2. ATTRIBUTE ERRORS:
   - VoiceoverScene has no self.camera.frame - don't use it
   - Use x_range/y_range for Axes, NOT x_min/x_max

3. LATEX ERRORS:
   - For non-English text, use Text() not Tex/MathTex
   - Always use raw strings for MathTex: r"\\frac{1}{2}"
   - Never use \\color{} in LaTeX - use color= parameter

4. NAME ERRORS:
   - Never shadow builtins: str, list, dict, int, float, len, max, min, sum
   - Check len() before indexing MathTex submobjects

5. MISSING ANIMATIONS:
   - Always FadeOut previous content before adding new content
   - Never use self.add() for content - always animate

6. RUNTIME ERRORS:
   - Use Group(*self.mobjects) not VGroup for mixed types

═══════════════════════════════════════════════════════════════════════════════
HELPER FUNCTIONS (these are available, use them)
═══════════════════════════════════════════════════════════════════════════════

- get_title_position(): Returns safe title position at top
- get_content_center(): Returns safe center position for content
- create_title(text): Creates properly positioned title
- create_label(text, style="body"): Creates text with proper sizing
- create_bullet_list_mixed(items): Creates bullet list (max 3 items!)
- Use native Manim layout primitives:
  - VGroup(...).arrange(DOWN, buff=0.8, aligned_edge=LEFT)
  - VGroup(...).arrange(RIGHT, buff=1.5, aligned_edge=UP)
  - next_to(..., buff=0.5+) for safe spacing

If a scene is overcrowded or unstable, split it into smaller scenes instead of preserving one giant construct().

OUTPUT ONLY THE CORRECTED PYTHON CODE. NO EXPLANATIONS.`;

  // Build system prompt with language adjustments
  const augmentedSystemPrompt = buildAugmentedSystemPrompt(
    regenerationSystemPrompt,
    detectedLanguage,
  );

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
          prompt: regenerationPrompt,
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
        logRetry("regenerateManimScriptWithError", attempt, err);
        break;
      }
      const delayMs = randomDelayMs();
      logRetry("regenerateManimScriptWithError", attempt, err, delayMs);
      await sleep(delayMs);
    }
  }

  throw new Error("regenerateManimScriptWithError: all retries exhausted");
}
