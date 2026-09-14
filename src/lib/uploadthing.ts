import { UTApi, UTFile } from "uploadthing/server";
import { safeError } from "./workflow/errors";

export interface UploadRequest {
  videoPath: string;
  userId: string;
  jobId?: string;
}

const isUploadResponseData = (
  data: unknown,
): data is { ufsUrl?: string; url?: string } => {
  if (!data || typeof data !== "object") {
    return false;
  }
  const record = data as Record<string, unknown>;
  const ufsUrl = record["ufsUrl"];
  const url = record["url"];
  return typeof ufsUrl === "string" || typeof url === "string";
};

export function uploadThingFetch(
  input: string | URL | Request,
  init?: RequestInit,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  // Let Undici calculate this from the final body. UploadThing's Effect adapter
  // can otherwise forward a stale/invalid value through Next's fetch wrapper.
  headers.delete("content-length");

  const timeoutSignal = AbortSignal.timeout(150_000);
  const signal = init?.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal;

  return globalThis.fetch(input, { ...init, headers, signal });
}

export async function uploadVideo({
  videoPath,
  userId,
  jobId,
}: UploadRequest): Promise<string> {
  const utapi = new UTApi({
    fetch: uploadThingFetch,
  });
  try {
    if (jobId) {
      const existing = await utapi.getFileUrls(jobId, { keyType: "customId" });
      if (existing.data[0]?.url) return existing.data[0].url;
    }
    if (!videoPath.startsWith("data:video/mp4;base64,")) {
      throw new Error("Expected base64 MP4 data URL for upload");
    }

    const base64Data = videoPath.replace("data:video/mp4;base64,", "");
    const buffer = Buffer.from(base64Data, "base64");
    console.log(`Decoded base64 data: ${buffer.length} bytes`);

    const fileName = `manim_video_${userId}_${Date.now()}.mp4`;
    const file = new UTFile([new Uint8Array(buffer)], fileName, {
      type: "video/mp4",
      customId: jobId,
    });

    console.log("Starting upload to UploadThing...");
    const response = await utapi.uploadFiles([file]);

    if (!response || response.length === 0) {
      throw new Error("No response from UploadThing");
    }

    const uploadResult = response[0];
    if (uploadResult.error) {
      throw new Error(`Upload failed: ${uploadResult.error.message}`);
    }

    if (!uploadResult.data) {
      throw new Error("Upload succeeded but no data returned");
    }

    const data = uploadResult.data;
    if (!isUploadResponseData(data)) {
      throw new Error("Upload succeeded but missing URL");
    }

    const uploadUrl = data.ufsUrl ?? data.url;
    if (!uploadUrl) {
      throw new Error("Upload succeeded but missing URL");
    }
    console.log(`Video uploaded successfully: ${uploadUrl}`);
    return uploadUrl;
  } catch (error) {
    const message = safeError(error);
    console.error("Upload failed:", message);
    throw new Error(`Video upload failed: ${message}`);
  }
}
