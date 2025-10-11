import { streamText, UIMessage, convertToModelMessages, tool } from "ai";
import { SYSTEM_PROMPT } from "@/prompt";
import { z } from "zod";
import { Sandbox } from "@e2b/code-interpreter";
import { inngest } from "@/lib/inngest";
import { jobStore } from "@/lib/job-store";
import { createGoogleProvider } from "@/lib/google-provider";

export const maxDuration = 30;

export async function POST(req: Request) {
  const { model: modelId, messages }: { messages: UIMessage[]; model: string } =
    await req.json();

  // Video generation is now handled by the generate_video tool

  const result = streamText({
    model: createGoogleProvider()(modelId),
    system: SYSTEM_PROMPT,
    messages: convertToModelMessages(messages),
    tools: {
      execute_python: tool({
        description:
          "Execute python code in a Jupyter notebook cell and return result",
        inputSchema: z.object({
          code: z
            .string()
            .describe("The python code to execute in a single cell"),
        }),
        execute: async ({ code }) => {
          // Create a sandbox, execute LLM-generated code, and return the result
          const sandbox = await Sandbox.create();
          const { text, results, logs, error } = await sandbox.runCode(code);
          return { text, results, logs, error };
        },
      }),
      generate_video: tool({
        description:
          "Generate a Manim animation video based on the user's description. Use this when users ask for animations, drawings, graphics, or video creation.",
        inputSchema: z.object({
          description: z
            .string()
            .describe(
              "A clear description of the animation or video to create"
            ),
        }),
        execute: async ({ description }) => {
          console.log("Starting video generation for:", description);

          // Create a job in the job store (KV in prod, memory in dev)
          const job = await jobStore.create(description);

          // Dispatch background job to Inngest, including jobId for status updates
          await inngest.send({
            name: "video/generate.request",
            data: {
              prompt: description,
              userId: "anonymous",
              chatId: Date.now().toString(), // Generate a chat ID
              jobId: job.id,
            },
          });

          return {
            status: "generating",
            description,
            jobId: job.id,
          };
        },
      }),
    },
  });

  return result.toUIMessageStreamResponse({
    sendReasoning: true,
  });
}
