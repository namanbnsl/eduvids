import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { Readable } from "node:stream";
import type { VideoVariant } from "./types";
import type { RelatedYouTubeVideo } from "./youtube-metadata";

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

export async function findPreviousYouTubeVideo(): Promise<
  RelatedYouTubeVideo | undefined
> {
  const youtube = getYouTubeClient();
  const channels = await youtube.channels.list({
    part: ["contentDetails"],
    mine: true,
    maxResults: 1,
  });
  const uploadsPlaylistId =
    channels.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) return undefined;

  const uploads = await youtube.playlistItems.list({
    part: ["snippet", "status"],
    playlistId: uploadsPlaylistId,
    maxResults: 10,
  });

  for (const item of uploads.data.items ?? []) {
    const videoId = item.snippet?.resourceId?.videoId;
    const title = item.snippet?.title?.trim();
    if (
      !videoId ||
      !title ||
      item.status?.privacyStatus === "private" ||
      title === "Private video" ||
      title === "Deleted video"
    ) {
      continue;
    }

    return {
      videoId,
      title,
      watchUrl: `https://www.youtube.com/watch?v=${videoId}`,
    };
  }

  return undefined;
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
