import { NextRequest } from "next/server";
import { jobStore } from "@/lib/job-store";
import { getConvexClient, api } from "@/lib/convex-server";
import {
  workflowClient,
  getBaseUrl,
  getTriggerHeaders,
} from "@/lib/workflow/client";
import { updateJobProgress } from "@/lib/workflow/utils/progress";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;

  try {
    const convexClient = getConvexClient();

    // Approve voiceover in Convex (atomic operation)
    const result = await convexClient.mutation(api.videos.approveVoiceover, {
      jobId: id,
    });

    if (!result.success) {
      return new Response(
        JSON.stringify({ error: result.error || "Failed to approve" }),
        {
          status: 400,
          headers: { "content-type": "application/json" },
        },
      );
    }

    // Update KV job status
    await updateJobProgress(id, {
      progress: 12,
      step: "Voiceover approved",
      details: "Resuming generation",
    });

    // Trigger continuation workflow if this is the first approval
    if (result.shouldTrigger && result.voiceoverApproved) {
      console.log(`🚀 Triggering continue-video workflow for job ${id}`);

      // Get the original job data from KV to get prompt
      const kvJob = await jobStore.get(id);

      await workflowClient.trigger({
        headers: getTriggerHeaders(),
        url: `${getBaseUrl()}/api/workflow/continue-video`,
        body: {
          jobId: id,
          prompt: result.description || kvJob?.description || "",
          voiceoverScript: result.voiceoverApproved,
          userId: result.userId || "anonymous",
          chatId: result.chatId || Date.now().toString(),
          variant: result.variant || "video",
          sources: result.sources,
        },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        jobId: id,
        alreadyApproved: !result.shouldTrigger,
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  } catch (error) {
    console.error("[voiceover/approve] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
