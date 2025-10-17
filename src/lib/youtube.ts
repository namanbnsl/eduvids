import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { Readable } from "node:stream";
import {
  generateYoutubeDescription,
  generateYoutubeTitle,
} from "@/lib/gemini";
import type { VideoVariant } from "./job-store";

export type YouTubePrivacyStatus = "public" | "unlisted" | "private";

export interface YouTubeUploadRequest {
  videoUrl: string;
  prompt: string;
  title: string;
  description?: string;
  tags?: string[];
  voiceoverScript?: string;
  privacyStatus?: YouTubePrivacyStatus;
  variant?: VideoVariant;
  thumbnailDataUrl?: string;
}



function getOAuth2Client(): OAuth2Client {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Missing Google OAuth env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN"
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
  prompt,
  title,
  description,
  tags,
  voiceoverScript,
  privacyStatus,
  variant,
  thumbnailDataUrl,
}: YouTubeUploadRequest): Promise<{ videoId: string; watchUrl: string }> {
  const auth = getOAuth2Client();
  const youtube = google.youtube({ version: "v3", auth });

  const privacy =
    privacyStatus ??
    (process.env.YOUTUBE_PRIVACY_STATUS as YouTubePrivacyStatus) ??
    "unlisted";

  const res = await fetch(videoUrl);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch video from UploadThing URL: ${res.status} ${res.statusText}`
    );
  }

  // Convert Web ReadableStream to Node Readable for googleapis client
  const arrayBuffer = await res.arrayBuffer();
  const mediaBuffer = Buffer.from(arrayBuffer);
  const mediaBody = Readable.from(mediaBuffer);

  // Generate title if not provided
  let finalYoutubeTitle = title?.trim() ?? "";
  if (!finalYoutubeTitle) {
    try {
      finalYoutubeTitle = await generateYoutubeTitle({
        prompt,
        voiceoverScript: voiceoverScript ?? "",
      });
    } catch (titleError) {
      console.warn("Failed to generate AI title:", titleError);
      finalYoutubeTitle = "AI-Generated Educational Video";
    }
  }

  // Generate description if not provided
  let finalDescription = description?.trim() ?? "";
  if (!finalDescription) {
    try {
      finalDescription = await generateYoutubeDescription({
        prompt,
        voiceoverScript: voiceoverScript ?? "",
      });
    } catch (error) {
      console.warn("Failed to generate AI description:", error);
      finalDescription = "An AI-generated educational video created with eduvids.";
    }
  }

  const insertRes = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title: finalYoutubeTitle,
        description: finalDescription,
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

  // Upload thumbnail if provided
  if (thumbnailDataUrl) {
    try {
      console.log("Uploading custom thumbnail for video:", videoId);
      
      // Convert data URL to buffer
      const base64Data = thumbnailDataUrl.replace(/^data:image\/\w+;base64,/, "");
      const thumbnailBuffer = Buffer.from(base64Data, "base64");
      const thumbnailStream = Readable.from(thumbnailBuffer);

      await youtube.thumbnails.set({
        videoId: videoId,
        media: {
          mimeType: "image/png",
          body: thumbnailStream,
        },
      });

      console.log("Custom thumbnail uploaded successfully for video:", videoId);
    } catch (thumbnailError) {
      console.error("Failed to upload thumbnail (non-fatal):", thumbnailError);
      // Don't fail the whole upload if thumbnail fails
    }
  }

  return { videoId, watchUrl: `https://www.youtube.com/watch?v=${videoId}` };
}
