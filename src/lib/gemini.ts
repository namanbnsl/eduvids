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
}: ManimScriptRequest): Promise<string> {
  const model = google("gemini-2.5-pro");
  const systemPrompt = MANIM_SYSTEM_PROMPT;

  const { text } = await generateText({
    model,
    system: systemPrompt,
    prompt: `User request: ${prompt}\n\nVoiceover narration:\n${voiceoverScript}\n\nGenerate the complete Manim script that follows the narration:`,
  });

  // Extract code from potential markdown formatting
  const code = text
    .replace(/```python?\n?/g, "")
    .replace(/```\n?/g, "")
    .trim();

  return code;
}

export async function generateYoutubeTitle({prompt, voiceoverScript}: ManimScriptRequest) {
  const model = google("gemini-2.5-flash");
  const systemPrompt = "You are a helpful assistant that generates catchy YouTube titles for educational videos based on the content provided. REMEMBER TO KEEP IT SHORT AND ENGAGING. ONLY PROVIDE THE TITLE, NOTHING ELSE.";
  const { text } = await generateText({
    model,
    system: systemPrompt,
    prompt: `User request: ${prompt}\n\nVoiceover narration:\n${voiceoverScript}\n\nGenerate a catchy YouTube title for the video that summarizes the content:`,
  });

  return text.trim();
}

export async function generateYoutubeDescription({prompt, voiceoverScript}: ManimScriptRequest) {
  const model = google("gemini-2.5-flash");
  const systemPrompt = "You are a helpful assistant that generates cool YouTube descriptions for educational videos based on the content provided. REMEMBER TO KEEP IT SHORT AND ENGAGING. ONLY PROVIDE THE DESCRIPTION, NOTHING ELSE.";
  const { text } = await generateText({
    model,
    system: systemPrompt,
    prompt: `User request: ${prompt}\n\nVoiceover narration:\n${voiceoverScript}\n\nGenerate the YouTube description for the video that summarizes the content:`,
  });

  return text.trim();
}