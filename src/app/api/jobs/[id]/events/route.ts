import { jobStore } from "@/lib/job-store";

export const dynamic = "force-dynamic";

// Simple Server-Sent Events endpoint that streams job progress periodically.
// In production, you can upgrade this to Redis Pub/Sub for push-based updates.
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  const encoder = new TextEncoder();

  let intervalId: ReturnType<typeof setInterval> | null = null;
  let closed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(`retry: 3000\n\n`));

      const send = async () => {
        if (closed) return;
        try {
          const job = await jobStore.get(id);
          if (closed) return;

          if (!job) {
            controller.enqueue(encoder.encode(`event: error\n`));
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ error: "Job not found" })}\n\n`
              )
            );
            controller.close();
            closed = true;
            return;
          }

          controller.enqueue(encoder.encode(`event: progress\n`));
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(job)}\n\n`)
          );

          if (job.status === "ready" || job.status === "error") {
            controller.close();
            closed = true;
          }
        } catch {
          if (!closed) {
            closed = true;
          }
        }
      };

      await send();
      if (!closed) {
        intervalId = setInterval(send, 2000);
      }
    },
    cancel() {
      closed = true;
      if (intervalId) clearInterval(intervalId);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
      pragma: "no-cache",
    },
  });
}
