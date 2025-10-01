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
  const model = google("gemini-2.5-pro");

  const systemPrompt = `
You are a skilled educational script writer tasked with drafting a concise narration for a Manim video.

Requirements:
- Produce 3 to 5 short paragraphs or segments of voiceover text.
- Keep language clear, engaging, and suited for spoken delivery.
- Each segment should be on its own line without numbering; keep lines under 220 characters.
- Avoid Markdown formatting, bullet points, or quotes—return plain text only.
- Ensure the narration flows logically from introduction to conclusion.
`;

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

  //   const systemPrompt = `
  // You are a Manim animation expert. Generate Python code for a Manim Community v0.18.0 animation based on the user's request.

  // Requirements:
  // - Return ONLY the complete Python code, nothing else
  // - DO NOT DO 3D things for now.
  // - KEEP THE CODE SIMPLE.
  // - USE SIMPLE COLORS. NO NEED TO USE COMPLEX COLORS.
  // - Use manim's Scene class and construct()
  // - Include all necessary imports
  // - Create a single, meaningful animation
  // - Ensure syntax is valid Python
  // - Use Manim's best practices for smooth animations
  // - ALWAYS USE THE NAME "MyScene" for all scenes just like the example. DO NOT CHANGE IT.

  // Example structure:
  // from manim import *

  // class MyScene(Scene):
  //     def construct(self):
  //         # Your animation code here
  //         pass

  // Common objects: Text, Circle, Rectangle, Line, Arrow
  // Common animations: self.play(), self.add(), self.wait()
  // `;

  const systemPrompt = `
You are a Manim Community v0.18.0 animation expert using the manim_voiceover plugin.

Requirements:
- Return ONLY the complete Python code, nothing else.
- DO NOT USE 3D.
- KEEP THE CODE SIMPLE and readable.
- USE ONLY SIMPLE COLORS (BLUE, RED, GREEN, YELLOW, WHITE).
- Always import from manim and manim_voiceover.
- The scene must be named "MyScene" and inherit from VoiceoverScene (and optionally Scene).
- Call self.set_speech_service(GTTSService()).
- Use the provided voiceover narration segments verbatim in with self.voiceover(text=...) blocks.
- Wrap each major animation sequence inside the corresponding voiceover block and ensure animations align with the narration.
- Use self.play(), FadeIn, FadeOut, Write, Create, Transform, and self.wait() to keep pacing natural.
- After displaying a key object, fade it out before moving to the next concept unless continuity is needed.
- Ensure valid Python syntax and include all required imports.
- Return plain Python code without Markdown fences or comments describing the code.

You will receive the user's prompt along with the narration segments. Match the visuals to the narration as closely as possible.

Example import structure:
from manim import *
from manim_voiceover import VoiceoverScene
from manim_voiceover.services.gtts import GTTSService

class MyScene(VoiceoverScene):
    def construct(self):
        ...
        with self.voiceover(text="This circle is drawn as I speak.") as tracker:
            self.play(Create(circle))
`;

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
