import { NextRequest } from "next/server";
import { jobStore } from "@/lib/job-store";
import { getConvexClient, api } from "@/lib/convex-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  try {
    const body = await req.json();
    const { voiceoverDraft } = body;

    if (typeof voiceoverDraft !== "string") {
      return new Response(
        JSON.stringify({ error: "voiceoverDraft is required" }),
        {
          status: 400,
          headers: { "content-type": "application/json" },
        },
      );
    }

    // Update in Convex for persistence
    const convexClient = getConvexClient();
    await convexClient.mutation(api.videos.updateVoiceoverDraft, {
      jobId: id,
      voiceoverDraft,
    });

    // Also update in KV for immediate polling access
    const kvJob = await jobStore.get(id);
    if (kvJob) {
      await jobStore.setVoiceoverPending(id, voiceoverDraft);
    }

    return new Response(JSON.stringify({ success: true, jobId: id }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    console.error("[voiceover/PATCH] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
