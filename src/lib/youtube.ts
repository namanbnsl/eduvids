import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";
import { Readable } from "node:stream";
import { generateYoutubeDescription } from "@/lib/gemini";
import type { VideoVariant } from "./job-store";

export type YouTubePrivacyStatus = "public" | "unlisted" | "private";

export interface YouTubeUploadRequest {
  videoUrl: string;
  prompt: string;
  title: string;
  tags?: string[];
  voiceoverScript?: string;
  privacyStatus?: YouTubePrivacyStatus;
  variant?: VideoVariant;
  thumbnailDataUrl?: string;
}

const YOUTUBE_DESCRIPTION_MAX_LENGTH = 5000;
const YOUTUBE_TITLE_MAX_LENGTH = 100;

function sanitizeYoutubeTitle(input: string): string {
  let sanitized = input
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[\p{Cf}\u0000-\u001F]/gu, "");

  if (sanitized.length > YOUTUBE_TITLE_MAX_LENGTH) {
    sanitized = sanitized.slice(0, YOUTUBE_TITLE_MAX_LENGTH).trim();
  }

  return sanitized;
}

function sanitizeYoutubeDescription(input: string): string {
  const normalized = input.replace(/\r\n/g, "\n");

  const withoutCodeFences = normalized.replace(/```[\s\S]*?```/g, (segment) =>
    segment.replace(/```/g, "")
  );

  let sanitized = withoutCodeFences
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/^[>\s]*[-*+]\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[(.*?)\]\((https?:\/\/[\w./?#=&%-]+)\)/g, "$1 ($2)")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!sanitized) {
    sanitized = normalized.trim();
  }

  if (sanitized.length > YOUTUBE_DESCRIPTION_MAX_LENGTH) {
    sanitized = sanitized.slice(0, YOUTUBE_DESCRIPTION_MAX_LENGTH).trim();
  }

  return sanitized;
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

  // Ensure title is a non-empty string acceptable by YouTube API
  const normalizedTitle = (title ?? "").toString().trim();
  if (!normalizedTitle) {
    throw new Error("YouTube upload title is empty after normalization");
  }

  const sanitizedTitle = sanitizeYoutubeTitle(normalizedTitle);
  if (!sanitizedTitle) {
    throw new Error("YouTube upload title is empty after sanitization");
  }

  const generatedYoutubeDescription = await generateYoutubeDescription({
    prompt,
    voiceoverScript: voiceoverScript!,
  });
  
  if (!generatedYoutubeDescription || generatedYoutubeDescription.trim().length === 0) {
    throw new Error("Failed to generate YouTube description from AI");
  }

  const finalDescription = `${generatedYoutubeDescription}\n\nThis video was generated completely by eduvids AI. There may be some factual inconsistencies, please verify from trusted sources.\n\nCreate your own AI-generated educational videos at https://eduvids.vercel.app or run it locally for yourself at https://github.com/namanbnsl/eduvids`;

  const sanitizedDescription = sanitizeYoutubeDescription(finalDescription);
  if (!sanitizedDescription) {
    throw new Error("YouTube description is empty after sanitization");
  }

  const shouldTagShorts =
    variant === "short" && !sanitizedTitle.toLowerCase().includes("#shorts");
  const finalYoutubeTitle = shouldTagShorts
    ? `${sanitizedTitle} #shorts`
    : sanitizedTitle;

  const insertRes = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title: finalYoutubeTitle,
        description: sanitizedDescription,
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
