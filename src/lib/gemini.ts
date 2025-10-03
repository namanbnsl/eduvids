import { MANIM_SYSTEM_PROMPT, VOICEOVER_SYSTEM_PROMPT } from "@/prompt";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";

const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_API_KEY!,
});

export interface VoiceoverScriptRequest {
  prompt: string;
}

export interface ManimScriptRequest {
  prompt: string;
  voiceoverScript: string;
  pluginExamples?: string[];
  selectedPluginNames?: string[];
  pluginImportHints?: string[];
}

export interface ManimScript {
  code: string;
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
  pluginExamples,
  selectedPluginNames,
  pluginImportHints,
}: ManimScriptRequest): Promise<string> {
  const model = google("gemini-2.5-pro");
  const systemPrompt = MANIM_SYSTEM_PROMPT;

  const pluginDirective = (() => {
    const names =
      selectedPluginNames && selectedPluginNames.length
        ? `You MUST use these Manim plugins: ${selectedPluginNames.join(
            ", "
          )}. Import and use their features in the script.`
        : "";
    const hints =
      pluginImportHints && pluginImportHints.length
        ? `Suggested import hints (adapt as needed):\n${pluginImportHints
            .map((h) => `- ${h}`)
            .join("\n")}`
        : "";
    const override =
      selectedPluginNames && selectedPluginNames.length
        ? "If a selected plugin requires specific scenes (e.g., ThreeDScene) or APIs, you may override earlier constraints to use it correctly."
        : "";
    const combined = [names, hints, override].filter(Boolean).join("\n\n");
    return combined ? combined + "\n\n" : "";
  })();

  const firstAttempt = await generateText({
    model,
    system: systemPrompt,
    prompt: `User request: ${prompt}\n\nVoiceover narration:\n${voiceoverScript}\n\n${pluginDirective}${
      pluginExamples && pluginExamples.length
        ? `The following plugin examples may be helpful. If relevant, adapt ideas from them:\n\n${pluginExamples
            .map((ex, i) => `Plugin Example ${i + 1}:\n${ex}`)
            .join("\n\n")}\n\n`
        : ""
    }Generate the complete Manim script that follows the narration:`,
  });

  // Extract code from potential markdown formatting
  let code = firstAttempt.text
    .replace(/```python?\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  // If plugins were requested, ensure at least one import hint is present; otherwise, retry once with stronger instruction
  const mustUsePlugins = !!(selectedPluginNames && selectedPluginNames.length);
  const hasImportHints = !!(pluginImportHints && pluginImportHints.length);
  const codeUsesPlugin = ((): boolean => {
    if (!hasImportHints) return true;
    const lowered = code.toLowerCase();
    return pluginImportHints!.some((hint) =>
      lowered.includes(hint.toLowerCase())
    );
  })();

  if (mustUsePlugins && hasImportHints && !codeUsesPlugin) {
    const retry = await generateText({
      model,
      system: systemPrompt,
      prompt: `You did not use the required plugins previously. STRICT REQUIREMENT: Use these plugins and include their imports in the code: ${selectedPluginNames!.join(
        ", "
      )}.\n\nImport hints:\n${pluginImportHints!
        .map((h) => `- ${h}`)
        .join(
          "\n"
        )}\n\nRe-generate the COMPLETE corrected Manim script now. User request: ${prompt}\n\nVoiceover narration:\n${voiceoverScript}`,
    });
    code = retry.text
      .replace(/```python?\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();
  }

  return code;
}

export interface PluginDescriptorForModel {
  name: string;
  description: string;
}

export async function selectManimPlugins(params: {
  prompt: string;
  voiceoverScript: string;
  plugins: PluginDescriptorForModel[];
}): Promise<string[]> {
  const model = google("gemini-2.5-flash");
  const { prompt, voiceoverScript, plugins } = params;
  const selectionPrompt = [
    "You are deciding which Manim plugins, if any, would meaningfully help implement the user's request.",
    "Return a JSON array of plugin names to install. Keep it minimal and only include plugins that clearly help.",
    "If none are useful, return an empty JSON array [].",
    "\nUser request:",
    prompt,
    "\nVoiceover narration:\n" + voiceoverScript,
    "\nAvailable plugins (name and description):\n" +
      plugins.map((p) => `- ${p.name}: ${p.description}`).join("\n"),
    "\nReturn only JSON, no commentary.",
  ].join("\n");

  const { text } = await generateText({
    model,
    system:
      "You strictly output minimal JSON with no extra text. Provide only an array of plugin names.",
    prompt: selectionPrompt,
  });

  try {
    const parsed = JSON.parse(text.trim());
    if (Array.isArray(parsed)) {
      return parsed.filter((v) => typeof v === "string");
    }
  } catch (_) {}
  // Fallback to no plugins if parsing fails
  return [];
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
  error: string;
  attemptNumber: number;
}

export async function regenerateManimScriptWithError({
  prompt,
  voiceoverScript,
  previousScript,
  error,
  attemptNumber,
}: RegenerateManimScriptRequest): Promise<string> {
  const model = google("gemini-2.5-pro");
  const systemPrompt = MANIM_SYSTEM_PROMPT;

  const { text } = await generateText({
    model,
    system: systemPrompt,
    prompt: `User request: ${prompt}\n\nVoiceover narration:\n${voiceoverScript}\n\n⚠️ PREVIOUS ATTEMPT #${attemptNumber} FAILED ⚠️\n\nThe previous Manim script failed with the following error:\n\`\`\`\n${error}\n\`\`\`\n\nThe broken script was:\n\`\`\`python\n${previousScript}\n\`\`\`\n\nPlease analyze the error carefully and generate a CORRECTED Manim script that:\n1. Fixes the specific error that occurred\n2. Follows the narration timeline\n3. Uses proper Manim syntax and best practices\n4. Avoids the mistakes from the previous attempt\n\nGenerate the complete FIXED Manim script:`,
  });

  // Extract code from potential markdown formatting
  const code = text
    .replace(/```python?\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  return code;
}
