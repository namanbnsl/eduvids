import { jobStore } from "@/lib/job-store";
import { getConvexClient, api } from "@/lib/convex-server";
import type { VideoJob } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id } = await ctx.params;

  // Try KV first (has progress info for in-flight jobs)
  const kvJob = await jobStore.get(id);
  if (kvJob) {
    return new Response(JSON.stringify(kvJob), {
      status: 200,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
      },
    });
  }

  // Fall back to Convex for completed/expired jobs
  try {
    const convexVideo = await getConvexClient().query(api.videos.getByJobId, {
      jobId: id,
    });

    if (convexVideo) {
      // Convert Convex video to VideoJob shape
      const job: VideoJob = {
        id: convexVideo.jobId,
        description: convexVideo.description,
        status: convexVideo.status,
        variant: convexVideo.variant,
        videoUrl: convexVideo.videoUrl,
        error: convexVideo.error,
        voiceoverDraft: convexVideo.voiceoverDraft,
        voiceoverApproved: convexVideo.voiceoverApproved,
        voiceoverStatus: convexVideo.voiceoverStatus,
        voiceoverUpdatedAt: convexVideo.voiceoverUpdatedAt
          ? new Date(convexVideo.voiceoverUpdatedAt).toISOString()
          : undefined,
        voiceoverApprovedAt: convexVideo.voiceoverApprovedAt
          ? new Date(convexVideo.voiceoverApprovedAt).toISOString()
          : undefined,
        youtubeStatus: convexVideo.youtubeStatus,
        youtubeUrl: convexVideo.youtubeUrl,
        youtubeVideoId: convexVideo.youtubeVideoId,
        youtubeError: convexVideo.youtubeError,
        sources: convexVideo.sources,
        progress: convexVideo.status === "ready" ? 100 : 0,
        step: convexVideo.status === "ready" ? "completed" : convexVideo.status,
        createdAt: new Date(convexVideo.createdAt).toISOString(),
        updatedAt: new Date(convexVideo.updatedAt).toISOString(),
      };

      return new Response(JSON.stringify(job), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "cache-control": "no-store",
        },
      });
    }
  } catch (err) {
    console.error("[api/jobs] Failed to query Convex:", err);
  }

  return new Response(JSON.stringify({ error: "Job not found" }), {
    status: 404,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}
