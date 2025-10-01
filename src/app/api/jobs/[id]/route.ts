import { jobStore } from "@/lib/job-store";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;
  const job = await jobStore.get(id);
  if (!job) {
    return new Response(JSON.stringify({ error: "Job not found" }), {
      status: 404,
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }
  return new Response(JSON.stringify(job), {
    status: 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}
