import { streamText, UIMessage, convertToModelMessages, tool } from "ai";
import { SYSTEM_PROMPT } from "@/prompt";
import { z } from "zod";
import { inngest } from "@/lib/inngest";
import { jobStore } from "@/lib/job-store";
import { createGoogleProvider } from "@/lib/google-provider";

export const maxDuration = 120;

export async function POST(req: Request) {
  const {
    messages,
    forceVariant,
  }: {
    messages: UIMessage[];
    forceVariant?: "video" | "short" | null;
  } = await req.json();

  // Video generation is now handled by the generate_video tool

  // Build system prompt with variant instruction if forced
  let systemPrompt = SYSTEM_PROMPT;
  if (forceVariant === "video") {
    systemPrompt +=
      '\n\nIMPORTANT: The user has requested a HORIZONTAL VIDEO (not a short). When calling generate_video tool, you MUST pass variant="video" to create a standard landscape/horizontal video format.';
  } else if (forceVariant === "short") {
    systemPrompt +=
      '\n\nIMPORTANT: The user has requested a VERTICAL SHORT. When calling generate_video tool, you MUST pass variant="short" to create a vertical/portrait video format.';
  }

  // Create a new provider instance for each request to rotate API keys
  const result = streamText({
    model: createGoogleProvider()("gemini-2.5-flash-lite"),
    toolChoice: "required",
    system: systemPrompt,
    messages: convertToModelMessages(messages),
    tools: {
      generate_video: tool({
        description:
          "Generate a Manim animation video or vertical short based on the user's description.",
        inputSchema: z.object({
          description: z
            .string()
            .describe(
              "A clear description of the animation or video to create"
            ),
          variant: z
            .enum(["video", "short"])
            .optional()
            .describe(
              "Specify 'short' to generate a vertical short, or 'video' for horizontal video."
            ),
        }),
        execute: async ({ description, variant }) => {
          console.log("Starting video generation for:", description);

          const normalized = description.trim();
          const normalizedLower = normalized.toLowerCase();

          // Use forced variant first, then tool parameter, then infer from description
          const inferredVariant =
            forceVariant && forceVariant !== null
              ? forceVariant
              : variant
              ? variant
              : normalizedLower.includes("short") ||
                normalizedLower.includes("vertical short")
              ? "short"
              : "video";

          console.log("Variant determination:", {
            forceVariant,
            toolVariant: variant,
            inferredVariant,
          });

          // Create a job in the job store (KV in prod, memory in dev)
          const job = await jobStore.create(description, {
            variant: inferredVariant,
          });

          // Dispatch background job to Inngest, including jobId for status updates
          await inngest.send({
            name: "video/generate.request",
            data: {
              prompt: description,
              userId: "anonymous",
              chatId: Date.now().toString(), // Generate a chat ID
              jobId: job.id,
              variant: inferredVariant,
            },
          });

          return {
            status: "generating",
            description,
            jobId: job.id,
            variant: inferredVariant,
          };
        },
      }),
    },
  });

  return result.toUIMessageStreamResponse({
    sendReasoning: true,
  });
}
