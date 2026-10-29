import { WorkflowNonRetryableError } from "@upstash/workflow";
import { safeError } from "@/lib/workflow/errors";
import { serve } from "@upstash/workflow/nextjs";

import {
  addVideoToPlaylist,
  listUploadedYouTubeVideos,
  selectPreviousYouTubeVideo,
  postYouTubeComment,
  setYouTubeThumbnail,
  uploadToYouTube,
} from "@/lib/youtube";
import {
  buildPreviousVideoComment,
  buildYouTubeDescription,
  parseVideoDescriptionPackage,
  type RelatedYouTubeVideo,
  type YouTubeChapter,
} from "@/lib/youtube-metadata";
import { jobStore, artifactStore } from "@/lib/job-store";
import { getConvexClient, api } from "@/lib/convex-server";
import { qstashClientWithBypass } from "@/lib/workflow/client";

import type { VideoVariant } from "@/lib/types";
import {
  assertValidUploadTitle,
  chapterLanguageErrors,
  repairYouTubeMetadata,
} from "@/lib/youtube-validation";
import {
  generateUploadTitle,
  generateUploadChapters,
  generateUploadDescription,
} from "@/lib/youtube-repair";

export const runtime = "nodejs";
export const maxDuration = 300;

type YouTubeUploadPayload = {
  videoUrl: string;
  title?: string;
  description?: string;
  prompt: string;
  jobId?: string;
  userId: string;
  variant?: VideoVariant;
  thumbnailUrl?: string;
  hashtags?: string[];
  tags?: string[];
  chapters?: YouTubeChapter[];
};

export const { POST } = serve<YouTubeUploadPayload>(
  async (context) => {
    const {
      videoUrl,
      title,
      description,
      prompt,
      jobId,
      variant,
      thumbnailUrl,
      hashtags,
      tags: topicTags,
      chapters,
    } = context.requestPayload;

    const isShort = variant === "short";
    // Specific search phrases first; YouTube caps the combined tag text at 500
    // characters.
    const tags: string[] = [];
    for (const tag of [
      ...(topicTags ?? []),
      "math",
      "science",
      "animation",
      ...(isShort ? ["shorts"] : []),
    ]) {
      if (tags.includes(tag)) continue;
      if ([...tags, tag].join(",").length > 450) break;
      tags.push(tag);
    }
    const key = jobId ?? context.workflowRunId;

    // Each repair has its own durable step and deadline. Do not combine these
    // model calls with the upload's separate 240-second request budget.
    const metadataStep = async <T>(name: string, work: () => Promise<T>) =>
      context.run(name, async (): Promise<{ value: T } | { error: string }> => {
        try {
          return { value: await work() };
        } catch (error) {
          return { error: safeError(error) };
        }
      });
    const needsReview = async (reason: string) => {
      await context.run("mark-youtube-needs-review", async () => {
        console.error("YouTube upload held for review:", reason);
        await artifactStore.set(
          key,
          "youtubeMetadataReview",
          JSON.stringify({ reason, at: new Date().toISOString() }),
        );
        if (jobId) {
          const update = {
            youtubeStatus: "needs_review" as const,
            youtubeError: reason,
          };
          await jobStore.setYoutubeStatus(jobId, update);
          await getConvexClient().mutation(api.videos.setYoutubeStatus, {
            jobId,
            ...update,
          });
        }
      });
      return { success: false, needsReview: true, error: reason };
    };
    const inventory = await metadataStep(
      "read-channel-title-inventory",
      async () => {
        const videos = await listUploadedYouTubeVideos();
        return {
          titles: videos.map((video) => video.title),
          previousVideo: selectPreviousYouTubeVideo(videos) ?? null,
        };
      },
    );
    if ("error" in inventory)
      return needsReview(
        `Cannot validate channel title uniqueness: ${inventory.error}`,
      );
    const previousVideo: RelatedYouTubeVideo | null =
      inventory.value.previousVideo;
    const source = async () => ({
      topic: prompt,
      script: jobId
        ? await artifactStore.find(jobId, "voiceoverScript")
        : undefined,
    });
    const validatedTitle = await metadataStep(
      "validate-upload-title",
      async () => {
        const material = await source();
        return repairYouTubeMetadata(
          title ?? "",
          (candidate) =>
            assertValidUploadTitle(candidate, inventory.value.titles),
          (feedback, signal) => generateUploadTitle(material, feedback, signal),
        );
      },
    );
    if ("error" in validatedTitle) return needsReview(validatedTitle.error);
    const finalTitle = validatedTitle.value;
    const validatedChapters = await metadataStep(
      "validate-upload-chapter-language",
      async () => {
        const material = await source();
        return repairYouTubeMetadata(
          chapters ?? [],
          async (candidate) => {
            const errors = await chapterLanguageErrors(finalTitle, candidate);
            if (errors.length) throw new Error(errors.join("; "));
            return candidate;
          },
          (feedback, signal) =>
            generateUploadChapters(
              material,
              finalTitle,
              chapters ?? [],
              feedback,
              signal,
            ),
        );
      },
    );
    if ("error" in validatedChapters)
      return needsReview(validatedChapters.error);
    const validatedDescription = await metadataStep(
      "validate-upload-description",
      async () => {
        const material = await source();
        return repairYouTubeMetadata(
          description ?? "",
          (candidate) =>
            parseVideoDescriptionPackage(
              JSON.stringify({ hook: candidate.split(/\r?\n/) }),
            ).hook,
          (feedback, signal) =>
            generateUploadDescription(material, finalTitle, feedback, signal),
        );
      },
    );
    if ("error" in validatedDescription)
      return needsReview(validatedDescription.error);
    await context.run("save-validated-youtube-metadata", async () => {
      await artifactStore.set(
        key,
        "validatedYoutubeMetadata",
        JSON.stringify({
          title: finalTitle,
          description: validatedDescription.value,
          chapters: validatedChapters.value,
        }),
      );
    });

    const finalDescription = buildYouTubeDescription({
      salesCopy: validatedDescription.value,
      previousVideo: previousVideo ?? undefined,
      chapters: validatedChapters.value,
      hashtags,
    });

    const youtubeResult = await context.run("upload-to-youtube", async () => {
      const saved = await artifactStore.find(key, "youtubeResult");
      if (saved)
        return JSON.parse(saved) as Awaited<ReturnType<typeof uploadToYouTube>>;
      // YouTube insert has no idempotency key. Never duplicate a possibly accepted upload.
      if (!(await artifactStore.claim(key, "youtubeUploadStarted"))) {
        throw new WorkflowNonRetryableError(
          "YouTube upload outcome is unknown; check the channel before retrying",
        );
      }
      try {
        const result = await uploadToYouTube({
          videoUrl,
          title: finalTitle,
          description: finalDescription,
          tags,
          variant,
        });
        await artifactStore.set(key, "youtubeResult", JSON.stringify(result));
        return result;
      } catch (error) {
        throw new WorkflowNonRetryableError(
          `YouTube upload could not be confirmed: ${safeError(error)}`,
        );
      }
    });

    // A regenerated title no longer has a matching title/thumbnail package.
    if (thumbnailUrl && finalTitle === title) {
      await context.run("set-youtube-thumbnail", async () => {
        const saved = await artifactStore.find(key, "youtubeThumbnailResult");
        if (saved) return JSON.parse(saved);
        try {
          await setYouTubeThumbnail({
            videoId: youtubeResult.videoId,
            thumbnailUrl,
          });
          const result = { success: true };
          await artifactStore.set(
            key,
            "youtubeThumbnailResult",
            JSON.stringify(result),
          );
          return result;
        } catch (error) {
          const result = { error: safeError(error) };
          console.warn(
            "Custom thumbnail failed; upload remains successful:",
            result.error,
          );
          await artifactStore.set(
            key,
            "youtubeThumbnailResult",
            JSON.stringify(result),
          );
          return result;
        }
      });
    }

    if (jobId) {
      await context.run("update-job-youtube-status", async () => {
        await jobStore.setYoutubeStatus(jobId, {
          youtubeStatus: "uploaded",
          youtubeUrl: youtubeResult.watchUrl,
          youtubeVideoId: youtubeResult.videoId,
          youtubeError: undefined,
        });
      });

      const { userId } = context.requestPayload;
      if (userId) {
        await context.run("save-to-convex", async () => {
          await getConvexClient().mutation(api.videos.saveCompleted, {
            jobId,
            userId,
            description: prompt,
            variant: variant ?? "video",
            videoUrl,
            youtubeUrl: youtubeResult.watchUrl,
            youtubeVideoId: youtubeResult.videoId,
          });
        });
      }
    }

    if (previousVideo) {
      await context.run("comment-previous-youtube-video", async () => {
        if (await artifactStore.find(key, "youtubeCommentResult")) return;
        if (!(await artifactStore.claim(key, "youtubeCommentStarted"))) return;

        try {
          const result = await postYouTubeComment({
            videoId: youtubeResult.videoId,
            text: buildPreviousVideoComment(previousVideo),
          });
          await artifactStore.set(
            key,
            "youtubeCommentResult",
            JSON.stringify(result),
          );
        } catch (error) {
          console.warn(
            "Previous-video comment failed; upload remains successful:",
            safeError(error),
          );
          await artifactStore.set(
            key,
            "youtubeCommentResult",
            JSON.stringify({ error: safeError(error) }),
          );
        }
      });
    }

    const playlistId = process.env.YOUTUBE_PLAYLIST_ID?.trim();
    if (playlistId) {
      await context.run("add-youtube-playlist-item", async () => {
        const saved = await artifactStore.find(key, "youtubePlaylistResult");
        if (saved) return JSON.parse(saved);

        try {
          const result = await addVideoToPlaylist({
            videoId: youtubeResult.videoId,
            playlistId,
          });
          await artifactStore.set(
            key,
            "youtubePlaylistResult",
            JSON.stringify(result),
          );
          return result;
        } catch (error) {
          const result = { error: safeError(error) };
          console.warn(
            "Playlist insertion failed; upload remains successful:",
            result.error,
          );
          await artifactStore.set(
            key,
            "youtubePlaylistResult",
            JSON.stringify(result),
          );
          return result;
        }
      });
    }

    return { success: true, ...youtubeResult };
  },
  {
    retries: 3,
    qstashClient: qstashClientWithBypass,
    failureFunction: async ({ context, failResponse }) => {
      const { jobId } = context.requestPayload;
      console.error("YouTube upload workflow failed:", safeError(failResponse));

      const status = jobId
        ? (await jobStore.get(jobId))?.youtubeStatus
        : undefined;
      if (jobId && status !== "uploaded" && status !== "needs_review") {
        await jobStore.setYoutubeStatus(jobId, {
          youtubeStatus: "failed",
          youtubeError:
            "YouTube upload could not be confirmed. Check the channel before retrying.",
        });
      }
    },
  },
);
