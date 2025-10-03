import { MANIM_SYSTEM_PROMPT, VOICEOVER_SYSTEM_PROMPT } from "@/prompt";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";
import fs from "fs";
import path from "path";

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY!,
});

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

export async function generateVoiceoverScript({
  prompt,
}: VoiceoverScriptRequest): Promise<string> {
  const model = google("gemini-2.5-flash-lite");

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

  // Attach local Manim docs (md + json) to the system prompt so the model has
  // authoritative reference material when generating scripts.
  const docsDir = path.join(process.cwd(), "docs");
  let manimShortRefMd = "";
  let manimShortRefJson: any = {};
  try {
    manimShortRefMd = fs.readFileSync(
      path.join(docsDir, "MANIM_SHORT_REF.md"),
      "utf8"
    );
  } catch (e) {
    // ignore if not present
  }
  try {
    const j = fs.readFileSync(
      path.join(docsDir, "MANIM_SHORT_REF.json"),
      "utf8"
    );
    manimShortRefJson = JSON.parse(j);
  } catch (e) {
    // ignore if not present or invalid
  }

  const augmentedSystemPrompt = `${MANIM_SYSTEM_PROMPT}\n\n---\nMANIM_SHORT_REF.md (local):\n${manimShortRefMd}\n\nMANIM_SHORT_REF.json (local):\n${JSON.stringify(
    manimShortRefJson
  )}\n---`;

  const firstAttempt = await generateText({
    model,
    system: augmentedSystemPrompt,
    prompt: `User request: ${prompt}\n\nVoiceover narration:\n${voiceoverScript}\n. Generate the complete Manim script that follows the narration:`,
  });

  // Extract code from potential markdown formatting
  let code = firstAttempt.text
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
  errorDetails?: {
    message?: string;
    stack?: string;
    stderr?: string;
    stdout?: string;
    exitCode?: number;
  };
  attemptNumber: number;
}

export async function regenerateManimScriptWithError({
  prompt,
  voiceoverScript,
  previousScript,
  error,
  errorDetails,
  attemptNumber,
}: RegenerateManimScriptRequest): Promise<string> {
  const model = google("gemini-2.5-pro");

  // Load local docs for context (same approach as generateManimScript)
  const docsDir = path.join(process.cwd(), "docs");
  let manimShortRefMd = "";
  let manimShortRefJson: any = {};
  try {
    manimShortRefMd = fs.readFileSync(
      path.join(docsDir, "MANIM_SHORT_REF.md"),
      "utf8"
    );
  } catch (e) {}
  try {
    const j = fs.readFileSync(
      path.join(docsDir, "MANIM_SHORT_REF.json"),
      "utf8"
    );
    manimShortRefJson = JSON.parse(j);
  } catch (e) {}

  const augmentedSystemPrompt = `${MANIM_SYSTEM_PROMPT}\n\n---\nMANIM_SHORT_REF.md (local):\n${manimShortRefMd}\n\nMANIM_SHORT_REF.json (local):\n${JSON.stringify(
    manimShortRefJson
  )}\n---`;

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

  const { text } = await generateText({
    model,
    system: augmentedSystemPrompt,
    prompt: `User request: ${prompt}\n\nVoiceover narration:\n${voiceoverScript}\n\n⚠️ PREVIOUS ATTEMPT #${attemptNumber} FAILED ⚠️\n\nThe previous Manim script failed with the following error:\n\`\`\`\n${error}\n\`\`\`${structuredErrorSection}\nThe broken script was:\n\`\`\`python\n${previousScript}\n\`\`\`\n\nPlease analyze the error carefully and generate a CORRECTED Manim script that:\n1. Fixes the specific error that occurred\n2. Follows the narration timeline\n3. Uses proper Manim syntax and best practices\n4. Avoids the mistakes from the previous attempt\n\nGenerate the complete FIXED Manim script:`,
  });

  // Extract code from potential markdown formatting
  const code = text
    .replace(/```python?\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  return code;
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

// Uses a separate Gemini 2.5 Pro pass to statically validate the Manim script.
// If issues are detected, the model is asked to return a corrected full script.
export async function verifyManimScript({
  prompt,
  voiceoverScript,
  script,
}: VerifyManimScriptRequest): Promise<VerifyManimScriptResult> {
  const model = google("gemini-2.5-pro");

  // Load local docs and attach them to the system prompt
  const docsDir = path.join(process.cwd(), "docs");
  let manimShortRefMd = "";
  let manimShortRefJson: any = {};
  try {
    manimShortRefMd = fs.readFileSync(
      path.join(docsDir, "MANIM_SHORT_REF.md"),
      "utf8"
    );
  } catch (e) {}
  try {
    const j = fs.readFileSync(
      path.join(docsDir, "MANIM_SHORT_REF.json"),
      "utf8"
    );
    manimShortRefJson = JSON.parse(j);
  } catch (e) {}

  const augmentedSystemPrompt = `${MANIM_SYSTEM_PROMPT}\n\n---\nMANIM_SHORT_REF.md (local):\n${manimShortRefMd}\n\nMANIM_SHORT_REF.json (local):\n${JSON.stringify(
    manimShortRefJson
  )}\n---`;

  const { text } = await generateText({
    model,
    system: augmentedSystemPrompt,
    prompt: [
      "You are a strict static validator for Manim Python scripts.",
      "Analyze the provided script for correctness BEFORE runtime: imports, Scene/ThreeDScene usage, method names, missing constructs, syntax, and obvious logic issues.",
      "Note do not change anything about the voiceover, etc. Do not add bookmarks, etc",
      "If there is nothing to change, please do not",
      "Return ONLY a concise JSON object with fields: ok (boolean), error (string optional), fixedScript (string optional).",
      "If ok would be false, supply a full corrected script in fixedScript.",
      "User request:",
      prompt,
      "Voiceover narration:\n" + voiceoverScript,
      "Script to validate (python):\n```python\n" + script + "\n```",
    ].join("\n\n"),
  });

  const raw = text.trim();
  // Try to robustly extract a JSON object, even if wrapped in fences or extra prose
  const extractJsonString = (input: string): string | null => {
    // Prefer fenced ```json ... ``` or ``` ... ``` blocks
    const fenced = input.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenced && fenced[1]) {
      return fenced[1].trim();
    }
    // Fallback: take substring from first '{' to last '}'
    const firstBrace = input.indexOf("{");
    const lastBrace = input.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return input.substring(firstBrace, lastBrace + 1).trim();
    }
    return null;
  };

  const candidate = extractJsonString(raw) ?? raw;

  try {
    const parsed = JSON.parse(candidate);
    const ok = !!parsed.ok;
    const error = typeof parsed.error === "string" ? parsed.error : undefined;
    let fixedScript =
      typeof parsed.fixedScript === "string" ? parsed.fixedScript : undefined;
    if (fixedScript) {
      // If the model wrapped the script in code fences, strip them
      fixedScript = fixedScript
        .replace(/```python?\n?/gi, "")
        .replace(/```\n?/g, "")
        .trim();
      // Sometimes models double-escape JSON strings; try to unescape once
      if (fixedScript.startsWith('"') && fixedScript.endsWith('"')) {
        try {
          fixedScript = JSON.parse(fixedScript);
        } catch (_) {
          // ignore if not valid JSON string
        }
      }
    }
    return { ok, error, fixedScript };
  } catch (_) {
    // If parsing fails, be safe and report not ok with model output
    return { ok: false, error: raw };
  }
}
