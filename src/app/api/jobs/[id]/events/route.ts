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

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      // Send initial retry hint
      controller.enqueue(encoder.encode(`retry: 3000\n\n`));

      let closed = false;
      const send = async () => {
        if (closed) return;
        const job = await jobStore.get(id);
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
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(job)}\n\n`));

        if (job.status === "ready" || job.status === "error") {
          controller.close();
          closed = true;
        }
      };

      // Kick off immediately, then poll every 2s
      await send();
      const interval = setInterval(send, 2000);

      const abort = () => {
        if (!closed) controller.close();
        clearInterval(interval as any);
        closed = true;
      };

      // Best-effort close when client disconnects
      // @ts-ignore - not all runtimes expose signal on Request here
      const signal: AbortSignal | undefined = (globalThis as any).request
        ?.signal;
      signal?.addEventListener("abort", abort);
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
