import { MANIM_SYSTEM_PROMPT, VOICEOVER_SYSTEM_PROMPT } from "@/prompt";
import { generateText, streamText, LanguageModel } from "ai";
import {
  createGoogleProvider,
  reportSuccess,
  reportError,
} from "./google-provider";
import { selectGroqModel, GROQ_MODEL_IDS } from "./groq-provider";
import { queryManimDocs } from "./deepwiki";

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
    "Directive: When you mention an acronym, initialism, or all-caps mnemonic, write ONLY the phonetic pronunciation in lowercase without showing the uppercase form or parentheses, so TTS reads it naturally once (e.g., write 'soah caah toa' instead of 'SOH CAH TOA', write 'dee en ay' instead of 'DNA'). For well-known acronyms that TTS handles correctly (like 'NASA' or 'FBI'), you may use the standard form.",
    "Draft the narration voiceover:",
  ].join("\n\n");

  // const model = selectGroqModel(GROQ_MODEL_IDS.gptOss);
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
    console.error(err);
    return "Script Generation Failed";
  }
}

// ---------------------------------------------------------------------------
// Thumbnail design generation via gemini-3.1-flash-lite
// ---------------------------------------------------------------------------

export interface ThumbnailDesign {
  html: string;
  css: string;
}

export interface ThumbnailDesignRequest {
  prompt: string;
  frameCount: number;
  sessionId: string;
}

export async function generateThumbnailDesign({
  prompt,
  frameCount,
  sessionId,
}: ThumbnailDesignRequest): Promise<ThumbnailDesign> {
  const systemPrompt = `You are a minimalist design expert. Generate complete HTML + CSS for a YouTube thumbnail (1280x720).

OUTPUT FORMAT — output ONLY valid JSON, no markdown fences, no explanation:
{
  "html": "<div class='container'>...use semantic HTML...</div>",
  "css": "* { ... } .container { ... } /* complete CSS */"
}

DESIGN PRINCIPLES:
- Minimalistic & clean aesthetic
- Limited color palette: max 2-3 colors (e.g., white + 1 accent + gray)
- Lots of whitespace
- Simple, bold typography (one or two font sizes)
- Subtle use of spacing and alignment
- Elegant rather than flashy
- No gradients, patterns, or visual clutter
- Focus on clarity and readability

TECHNICAL REQUIREMENTS:
- Width: 1280px, Height: 720px
- Use inline CSS classes only (no external imports except system fonts)
- ${frameCount} frame(s) available as <img> elements with src placeholder
- Title should be ${frameCount > 1 ? "prominent" : "centered"}
- Use semantic HTML (div, h1, h2, p, img, etc)
- Ensure high contrast for text readability

EXAMPLE AESTHETIC:
- Black text on white background with subtle gray accents
- Clean sans-serif (system fonts)
- Generous padding and margins
- Maybe a thin border or subtle shadow for depth
- Video frames displayed minimally (small size, clean borders)`;

  const userPrompt = `Create a minimalist YouTube thumbnail for: "${prompt}"\n\nKeep it clean, elegant, and uncluttered. Maximum 2-3 colors. Focus on clarity.`;

  const googleModel = await createGoogleModel("gemini-3.1-flash-lite-preview");
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

  const cleaned = text
    .replace(/```json?\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  try {
    return JSON.parse(cleaned) as ThumbnailDesign;
  } catch {
    return {
      html: "<div style='display:flex;align-items:center;justify-content:center;width:1280px;height:720px;background:#fff;color:#000;font-family:sans-serif;font-size:48px;text-align:center;padding:20px;'>Thumbnail generation failed</div>",
      css: "",
    };
  }
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
  // Fetch relevant manim docs from DeepWiki (best-effort)
  const manimDocs = await queryManimDocs(errors);

  const systemPrompt = `You are a Manim Community v0.18.0 debugging expert.
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
- Preserve all existing imports, class names, and voiceover text.`;

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

  const googleModel = await createGoogleModel("gemini-3.1-flash-lite-preview");
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
    return fixed;
  } catch (err) {
    console.error("[fixManimScript] LLM call failed:", err);
    // Return original script so the caller can decide whether to retry
    return script;
  }
}
