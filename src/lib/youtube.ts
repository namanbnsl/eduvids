import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { Readable } from "node:stream";
import type { VideoVariant } from "./types";
import type { RelatedYouTubeVideo } from "./youtube-metadata";
import {
  assertValidUploadTitle,
  titleValidationErrors,
} from "./youtube-validation";

export type YouTubePrivacyStatus = "public" | "unlisted" | "private";

export interface YouTubeUploadRequest {
  videoUrl: string;
  title: string;
  description?: string;
  tags?: string[];
  privacyStatus?: YouTubePrivacyStatus;
  variant?: VideoVariant;
}

function getOAuth2Client(): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Missing Google OAuth env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN",
    );
  }

  const oauth2Client = new OAuth2Client(clientId, clientSecret);
  oauth2Client.setCredentials({
    refresh_token: refreshToken,
  });
  return oauth2Client;
}

function getYouTubeClient() {
  return google.youtube({ version: "v3", auth: getOAuth2Client() });
}

export interface UploadedYouTubeVideo extends RelatedYouTubeVideo {
  description: string;
  privacyStatus?: string;
}

/** Read every uploads page: checking only the latest ten misses duplicates. */
export async function listUploadedYouTubeVideos(): Promise<
  UploadedYouTubeVideo[]
> {
  const youtube = getYouTubeClient();
  const signal = AbortSignal.timeout(90_000);
  const channels = await youtube.channels.list(
    { part: ["contentDetails"], mine: true, maxResults: 1 },
    { signal, timeout: 30_000, retry: false },
  );
  const uploadsPlaylistId =
    channels.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId)
    throw new Error(
      "No channel uploads playlist; cannot check title uniqueness",
    );
  const videos: UploadedYouTubeVideo[] = [];
  let pageToken: string | undefined;
  do {
    const uploads = await youtube.playlistItems.list(
      {
        part: ["snippet", "status"],
        playlistId: uploadsPlaylistId,
        maxResults: 50,
        pageToken,
      },
      { signal, timeout: 30_000, retry: false },
    );
    for (const item of uploads.data.items ?? []) {
      const videoId = item.snippet?.resourceId?.videoId;
      const title = item.snippet?.title?.trim();
      if (
        !videoId ||
        !title ||
        title === "Private video" ||
        title === "Deleted video"
      ) {
        continue;
      }

      videos.push({
        videoId,
        title,
        watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
        description: item.snippet?.description ?? "",
        privacyStatus: item.status?.privacyStatus ?? undefined,
      });
    }
    pageToken = uploads.data.nextPageToken ?? undefined;
  } while (pageToken);
  return videos;
}

export function selectPreviousYouTubeVideo(
  videos: UploadedYouTubeVideo[],
): RelatedYouTubeVideo | undefined {
  return videos.find(
    (video) =>
      video.privacyStatus !== "private" &&
      !titleValidationErrors(
        video.title,
        videos
          .filter((other) => other.videoId !== video.videoId)
          .map((other) => other.title),
      ).length,
  );
}

export async function findPreviousYouTubeVideo(): Promise<
  RelatedYouTubeVideo | undefined
> {
  return selectPreviousYouTubeVideo(await listUploadedYouTubeVideos());
}

export async function postYouTubeComment({
  videoId,
  text,
}: {
  videoId: string;
  text: string;
}): Promise<{ commentThreadId?: string }> {
  const youtube = getYouTubeClient();
  const result = await youtube.commentThreads.insert({
    part: ["snippet"],
    requestBody: {
      snippet: {
        videoId,
        topLevelComment: {
          snippet: { textOriginal: text },
        },
      },
    },
  });

  return { commentThreadId: result.data.id ?? undefined };
}

export async function addVideoToPlaylist({
  videoId,
  playlistId,
}: {
  videoId: string;
  playlistId: string;
}): Promise<{ playlistItemId?: string; alreadyPresent: boolean }> {
  const youtube = getYouTubeClient();
  const existing = await youtube.playlistItems.list({
    part: ["id"],
    playlistId,
    videoId,
    maxResults: 1,
  });
  const existingId = existing.data.items?.[0]?.id;
  if (existingId) {
    return { playlistItemId: existingId, alreadyPresent: true };
  }

  const result = await youtube.playlistItems.insert({
    part: ["snippet"],
    requestBody: {
      snippet: {
        playlistId,
        resourceId: {
          kind: "youtube#video",
          videoId,
        },
      },
    },
  });

  return {
    playlistItemId: result.data.id ?? undefined,
    alreadyPresent: false,
  };
}

export async function setYouTubeThumbnail({
  videoId,
  thumbnailUrl,
}: {
  videoId: string;
  thumbnailUrl: string;
}): Promise<void> {
  const youtube = getYouTubeClient();
  const signal = AbortSignal.timeout(120_000);
  const response = await fetch(thumbnailUrl, { signal });
  if (!response.ok) {
    throw new Error(
      `Failed to fetch thumbnail: ${response.status} ${response.statusText}`,
    );
  }

  await youtube.thumbnails.set(
    {
      videoId,
      media: {
        mimeType: "image/png",
        body: Readable.from(Buffer.from(await response.arrayBuffer())),
      },
    },
    { signal, timeout: 120_000, retry: false },
  );
}

export async function uploadToYouTube({
  videoUrl,
  title,
  description,
  tags,
  privacyStatus,
}: YouTubeUploadRequest): Promise<{
  videoId: string;
  watchUrl: string;
  title: string;
}> {
  assertValidUploadTitle(title);
  const youtube = getYouTubeClient();

  const privacy =
    privacyStatus ??
    (process.env.YOUTUBE_PRIVACY_STATUS as YouTubePrivacyStatus) ??
    "unlisted";

  const signal = AbortSignal.timeout(240_000);
  const res = await fetch(videoUrl, { signal });
  if (!res.ok) {
    throw new Error(
      `Failed to fetch video from UploadThing URL: ${res.status} ${res.statusText}`,
    );
  }

  // Convert Web ReadableStream to Node Readable for googleapis client
  const arrayBuffer = await res.arrayBuffer();
  const mediaBuffer = Buffer.from(arrayBuffer);
  const mediaBody = Readable.from(mediaBuffer);

  const insertRes = await youtube.videos.insert(
    {
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: title,
          description,
          tags,
          categoryId: "27",
        },
        status: {
          privacyStatus: privacy,
        },
      },
      media: {
        mimeType: "video/mp4",
        body: mediaBody,
      },
    },
    { signal, timeout: 240_000, retry: false },
  );

  const videoId = insertRes.data.id;
  if (!videoId) {
    throw new Error("YouTube upload did not return a video ID");
  }

  return {
    videoId,
    watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
    title: title,
  };
}
