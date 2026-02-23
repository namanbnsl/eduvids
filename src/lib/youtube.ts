import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { Readable } from "node:stream";
import type { VideoVariant } from "./types";

export type YouTubePrivacyStatus = "public" | "unlisted" | "private";

export interface YouTubeUploadRequest {
  videoUrl: string;
  title: string;
  description?: string;
  tags?: string[];
  privacyStatus?: YouTubePrivacyStatus;
  thumbnailDataUrl?: string;
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
  const auth = getOAuth2Client();
  const youtube = google.youtube({ version: "v3", auth });

  const privacy =
    privacyStatus ??
    (process.env.YOUTUBE_PRIVACY_STATUS as YouTubePrivacyStatus) ??
    "unlisted";

  const res = await fetch(videoUrl);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch video from UploadThing URL: ${res.status} ${res.statusText}`,
    );
  }

  // Convert Web ReadableStream to Node Readable for googleapis client
  const arrayBuffer = await res.arrayBuffer();
  const mediaBuffer = Buffer.from(arrayBuffer);
  const mediaBody = Readable.from(mediaBuffer);

  const insertRes = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title: title,
        description:
          description +
          `\n\nGenerate your own videos for free at https://eduvids.app`,
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
  });

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
