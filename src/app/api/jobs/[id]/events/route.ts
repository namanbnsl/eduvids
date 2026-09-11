import { jobStore } from "@/lib/job-store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Close before the host deadline. EventSource reconnects (or the client polls).
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let closed = false;
  let close = () => {};
  const cleanup = () => {
    closed = true;
    clearTimeout(timer);
    clearTimeout(deadline);
    req.signal.removeEventListener("abort", close);
  };
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      close = () => {
        if (closed) return;
        cleanup();
        controller.close();
      };
      req.signal.addEventListener("abort", close, { once: true });
      if (req.signal.aborted) return close();
      controller.enqueue(encoder.encode("retry: 3000\n\n"));
      deadline = setTimeout(close, 45_000);
      const send = async () => {
        try {
          const job = await jobStore.get(id);
          if (closed) return;
          if (!job) {
            controller.enqueue(
              encoder.encode(
                'event: error\ndata: {"error":"Job not found"}\n\n',
              ),
            );
            return close();
          }
          controller.enqueue(
            encoder.encode(`event: progress\ndata: ${JSON.stringify(job)}\n\n`),
          );
          if (job.status === "ready" || job.status === "error") return close();
          timer = setTimeout(send, 2000); // No overlapping KV reads.
        } catch {
          close();
        }
      };
      void send();
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
    },
  });
}
