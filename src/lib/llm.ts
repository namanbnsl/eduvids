import { MANIM_SYSTEM_PROMPT, VOICEOVER_SYSTEM_PROMPT } from "@/prompt";
import { generateText, LanguageModel } from "ai";
import fs from "fs";
import path from "path";
import {
  createGoogleProvider,
  reportSuccess,
  reportError,
} from "./google-provider";
import { selectGroqModel, GROQ_MODEL_IDS } from "./groq-provider";
import { RenderLogEntry, ValidationStage } from "@/lib/types";

interface GoogleModelConfig {
  modelId: string;
  provider: ReturnType<typeof createGoogleProvider>;
}

const createGoogleModel = (modelId: string): GoogleModelConfig => {
  const provider = createGoogleProvider();
  return { modelId, provider };
};

/**
 * Wrapper for generateText that automatically reports success/failure to key manager
 */
async function generateTextWithTracking<
  T extends Parameters<typeof generateText>[0]
>(
  config: T & { model: LanguageModel },
  googleConfig?: GoogleModelConfig
): Promise<Awaited<ReturnType<typeof generateText>>> {
  try {
    const result = await generateText(config);

    // Report success if this was a Google model
    if (googleConfig) {
      reportSuccess(googleConfig.provider);
    }

    return result;
  } catch (error) {
    // Report error if this was a Google model
    if (googleConfig) {
      reportError(googleConfig.provider, error);
    }

    throw error;
  }
}

// Retry helpers for Gemini calls
const SLEEP_MIN_MS = 30_000;
const SLEEP_MAX_MS = 40_000;
const GEMINI_MAX_RETRIES = 3; // number of retries after the initial attempt

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));
const randomDelayMs = () =>
  SLEEP_MIN_MS + Math.floor(Math.random() * (SLEEP_MAX_MS - SLEEP_MIN_MS + 1));

const logRetry = (
  fnName: string,
  attempt: number,
  error: unknown,
  delayMs?: number
) => {
  const errorMsg = error instanceof Error ? error.message : String(error);
  console.warn(
    `[${fnName}] Attempt ${attempt + 1}/${
      GEMINI_MAX_RETRIES + 1
    } failed: ${errorMsg}${
      delayMs
        ? ` - retrying in ${Math.round(delayMs / 1000)}s`
        : " - no more retries"
    }`
  );
};

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

/**
 * Detects the language of the given text using LLM.
 * Falls back to 'english' if detection fails.
 */
async function detectLanguageWithLLM(text: string): Promise<string> {
  try {
    const googleModel = createGoogleModel("gemini-2.5-flash-lite");

    // Truncate text to avoid excessive token usage (first 500 chars should be enough)
    const sampleText = text.slice(0, 500);

    const { text: response } = await generateTextWithTracking(
      {
        model: googleModel.provider(googleModel.modelId),
        system: `You are a language detection expert. Analyze the given text and identify its primary language. 
Respond with ONLY ONE lowercase language name from this list: english, spanish, french, german, italian, portuguese, russian, chinese, japanese, korean, hindi, arabic.
If the text is in multiple languages, return the dominant one. If you cannot determine the language with confidence, return "english".
Do not provide any explanation, just the language name.`,
        prompt: `Detect the language of this text:\n\n${sampleText}`,
        temperature: 0,
      },
      googleModel
    );

    const detectedLang = response.trim().toLowerCase();

    // Validate the response is a known language
    const validLanguages = [
      "english",
      "spanish",
      "french",
      "german",
      "italian",
      "portuguese",
      "russian",
      "chinese",
      "japanese",
      "korean",
      "hindi",
      "arabic",
    ];

    if (validLanguages.includes(detectedLang)) {
      return detectedLang;
    }

    console.warn(
      `LLM returned unexpected language: "${detectedLang}", defaulting to english`
    );
    return "english";
  } catch (error) {
    console.error("Language detection failed:", error);
    return "english"; // Default fallback
  }
}

function buildAugmentedSystemPrompt(base: string, language?: string): string {
  const { markdown } = loadManimReferenceDocs();
  let modifiedBase = base;

  // If language is not English, comprehensively modify the prompt to allow Text instead of requiring LaTeX
  if (language && language !== "english") {
    const langUpper = language.toUpperCase();

    // 1. Replace the main LaTeX requirement line
    modifiedBase = modifiedBase.replace(
      /- \*\*ALL ON-SCREEN TEXT MUST BE LATEX\*\*: Use Tex\/MathTex via the provided helpers \(create_tex_label, create_text_panel\)\. NEVER use Text, MarkupText, or Paragraph directly\./g,
      `- **FOR ${langUpper} TEXT, USE Text() INSTEAD OF LATEX**: LaTeX does not properly support ${language} characters. For all non-mathematical text, use the Text() class directly: Text("your text", font_size=FONT_BODY, color=WHITE). ONLY use Tex/MathTex for mathematical formulas and equations. Never use create_tex_label for ${language} text.`
    );

    // 2. Modify all create_tex_label references to suggest Text() for non-English
    modifiedBase = modifiedBase.replace(
      /create_tex_label\(/g,
      `Text(  # For ${language}, use Text() instead of create_tex_label(`
    );

    // 3. Add a prominent section at the beginning about non-English text handling
    const nonEnglishHeader = `
⚠️ CRITICAL - ${langUpper} LANGUAGE DETECTED ⚠️
This video is in ${language.toUpperCase()}. IMPORTANT RULES:
1. **USE Text() FOR ALL NON-MATHEMATICAL TEXT**: Text("your text", font_size=FONT_BODY, color=WHITE)
2. **USE Tex/MathTex ONLY FOR MATH**: MathTex(r"E = mc^2", font_size=FONT_MATH)
3. **NEVER use create_tex_label, create_text_panel, or create_bullet_item for ${language} text**
4. **For bullets in ${language}**: Create Text() objects and arrange them manually
5. **Example correct usage**:
   title = Text("${
     language === "spanish"
       ? "Título"
       : language === "french"
       ? "Titre"
       : language === "german"
       ? "Titel"
       : "Title"
   }", font_size=FONT_TITLE, color=WHITE)
   body = Text("${
     language === "spanish"
       ? "Contenido"
       : language === "french"
       ? "Contenu"
       : language === "german"
       ? "Inhalt"
       : "Content"
   }", font_size=FONT_BODY, color=WHITE)
6. **LaTeX will NOT work for ${language} characters** - it will show garbled text or errors

`;

    modifiedBase = nonEnglishHeader + modifiedBase;

    // 4. Modify bullet point creation instructions
    modifiedBase = modifiedBase.replace(
      /\*\*RECOMMENDED:\*\* Use the \\`create_bullet_list\\` helper function for safe, consistent bullet points/g,
      `**FOR ${langUpper}**: DO NOT use create_bullet_list - it uses LaTeX which doesn't support ${language}. Instead, create Text() objects and arrange them vertically`
    );

    // 5. Update text panel instructions
    modifiedBase = modifiedBase.replace(
      /create_text_panel\(/g,
      `# For ${language}, manually create Text() + Rectangle instead of create_text_panel(`
    );
  }

  return `${modifiedBase}\n\n---\nMANIM_SHORT_REF.md (local):\n${markdown}\n\nMANIM_SHORT_REF.json (local):\n---`;
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
  stage?: ValidationStage;
  hint?: string;
  logs?: RenderLogEntry[];
}

export interface ManimGenerationAttempt {
  attemptNumber: number;
  script: string;
  error: ManimGenerationErrorDetails;
}

export async function generateVoiceoverScript({
  prompt,
}: VoiceoverScriptRequest): Promise<string> {
  const systemPrompt = VOICEOVER_SYSTEM_PROMPT;

  const composedPrompt = [
    `User request: ${prompt}`,
    `Use the language that is asked for and output text in that script`,
    "Directive: Cover every essential idea from the request in sequence, adding extra BODY lines when needed so no core step is skipped.",
    "Directive: Keep the narration purely educational—no jokes, sound effects, or entertainment filler.",
    "Directive: Focus on a single clearly defined topic drawn from the user request—do not introduce unrelated hooks, metaphors, or tangents.",
    "Directive: Start with an engaging hook that immediately connects to the topic and states the learning objective; avoid vague rhetorical questions that are never answered.",
    "Directive: Develop each BODY line with concrete explanations, definitions, or reasoning so the listener learns how and why—not just what.",
    "Directive: Ensure the worked example and reflection lines explicitly reference the same core concept and build on prior steps.",
    "Directive: Maintain smooth flow by referencing prior steps and previewing what comes next.",
    "Directive: When you mention an acronym, initialism, or all-caps mnemonic, write ONLY the phonetic pronunciation in lowercase without showing the uppercase form or parentheses, so TTS reads it naturally once (e.g., write 'soah caah toa' instead of 'SOH CAH TOA', write 'dee en ay' instead of 'DNA'). For well-known acronyms that TTS handles correctly (like 'NASA' or 'FBI'), you may use the standard form.",
    "Draft the narration segments:",
  ].join("\n\n");

  for (let attempt = 0; attempt <= GEMINI_MAX_RETRIES; attempt++) {
    const googleModel = createGoogleModel("gemini-2.5-flash");
    try {
      const { text } = await generateTextWithTracking(
        {
          model: googleModel.provider(googleModel.modelId),
          system: systemPrompt,
          prompt: composedPrompt,
        },
        googleModel
      );

      return text.trim();
    } catch (err) {
      if (attempt === GEMINI_MAX_RETRIES) {
        logRetry("generateVoiceoverScript", attempt, err);
        break;
      }
      const delayMs = randomDelayMs();
      logRetry("generateVoiceoverScript", attempt, err, delayMs);
      await sleep(delayMs);
    }
  }

  // Fallback to Gemini 2.5 Pro if Gemini Flash fails after retries
  const proModel = createGoogleModel("gemini-2.5-pro");
  const { text: proText } = await generateTextWithTracking(
    {
      model: proModel.provider(proModel.modelId),
      system: systemPrompt,
      prompt: composedPrompt,
    },
    proModel
  );
  return proText.trim();
}

export async function generateManimScript({
  prompt,
  voiceoverScript,
}: ManimScriptRequest): Promise<string> {
  // Detect language from voiceover script using LLM
  const detectedLanguage = await detectLanguageWithLLM(voiceoverScript);
  console.log(`Detected language: ${detectedLanguage}`);

  const augmentedSystemPrompt = buildAugmentedSystemPrompt(
    MANIM_SYSTEM_PROMPT,
    detectedLanguage
  );
  const generationPrompt = `User request: ${prompt}\n\nVoiceover narration:\n${voiceoverScript}\n\nGenerate the complete Manim script that follows the narration with purposeful, step-by-step visuals that directly reinforce each narrated idea while staying on the same core topic:`;

  for (let attempt = 0; attempt <= GEMINI_MAX_RETRIES; attempt++) {
    const googleModel = createGoogleModel("gemini-2.5-pro");
    try {
      const { text } = await generateTextWithTracking(
        {
          model: googleModel.provider(googleModel.modelId),
          system: augmentedSystemPrompt,
          prompt: generationPrompt,
          temperature: 0.1,
        },
        googleModel
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

  // Fallback to Gemini 2.5 Flash if Gemini Pro fails after retries
  const flashModel = createGoogleModel("gemini-2.5-flash");
  const { text: flashText } = await generateTextWithTracking(
    {
      model: flashModel.provider(flashModel.modelId),
      system: augmentedSystemPrompt,
      prompt: generationPrompt,
      temperature: 0.1,
    },
    flashModel
  );
  const code = flashText
    .replace(/```python?\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();
  return code;
}

export async function generateYoutubeTitle({
  prompt,
  voiceoverScript,
}: ManimScriptRequest) {
  const model = selectGroqModel(GROQ_MODEL_IDS.gptOss);

  const systemPrompt =
    "You are a creative writer crafting clear, informative YouTube titles for educational videos. Keep it under 80 characters, avoid clickbait phrasing, and respond with only the final title—no quotes or extra text. Angled brackets are not allowed. ";
  const { text } = await generateText({
    model,
    system: systemPrompt,
    prompt: `User request: ${prompt}\n\nVoiceover narration:\n${voiceoverScript}\n\nWrite an informative YouTube title that clearly states the main topic or insight of the video, highlights the primary takeaway, avoids sensational language, and stays under 80 characters:`,
    temperature: 0.5,
  });

  return text.trim();
}

export async function generateYoutubeDescription({
  prompt,
  voiceoverScript,
}: ManimScriptRequest) {
  const model = selectGroqModel(GROQ_MODEL_IDS.gptOss);

  const systemPrompt =
    "You are a content strategist who writes concise, informative YouTube descriptions for educational videos. Summaries should explain what the video covers, avoid emojis, hashtags, and marketing language, and respond only with plain text. Angled brackets are not allowed.";
  const { text } = await generateText({
    model,
    system: systemPrompt,
    prompt: `User request: ${prompt}\n\nVoiceover narration:\n${voiceoverScript}\n\nWrite a YouTube description that briefly introduces the topic, outlines the main concepts viewers will learn, references any notable examples or tools, stays concise, and does not copy the voiceover script verbatim:`,
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
  // Detect language from voiceover script using LLM
  const detectedLanguage = await detectLanguageWithLLM(voiceoverScript);
  console.log(`Detected language for regeneration: ${detectedLanguage}`);

  const augmentedSystemPrompt = buildAugmentedSystemPrompt(
    MANIM_SYSTEM_PROMPT,
    detectedLanguage
  );

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
        blockedScripts.map((script) => {
          const trimmed = script.trim();
          return [trimmed, truncate(trimmed, 6000)];
        })
      ).values()
    );
    if (!unique.length) return "";
    const blocks = unique
      .map(
        (script, idx) => `--- Failed Script Variant #${idx + 1} ---\n${script}`
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

  for (let attempt = 0; attempt <= GEMINI_MAX_RETRIES; attempt++) {
    const googleModel = createGoogleModel("gemini-2.5-pro");
    try {
      const { text } = await generateTextWithTracking(
        {
          model: googleModel.provider(googleModel.modelId),
          system: augmentedSystemPrompt,
          prompt: regenerationPrompt,
          temperature: 0.1,
        },
        googleModel
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

  // Fallback to Gemini 2.5 Flash if Gemini Pro fails after retries
  const flashModel = createGoogleModel("gemini-2.5-flash");
  const { text: flashText } = await generateTextWithTracking(
    {
      model: flashModel.provider(flashModel.modelId),
      system: augmentedSystemPrompt,
      prompt: regenerationPrompt,
      temperature: 0.1,
    },
    flashModel
  );
  const code = flashText
    .replace(/```python?\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();
  return code;
}
