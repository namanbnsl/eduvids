import { UTApi, UTFile } from "uploadthing/server";

const utapi = new UTApi();

export interface UploadRequest {
  videoPath: string;
  userId: string;
}

const isUploadResponseData = (
  data: unknown
): data is { ufsUrl?: string; url?: string } => {
  if (!data || typeof data !== "object") {
    return false;
  }
  const record = data as Record<string, unknown>;
  const ufsUrl = record["ufsUrl"];
  const url = record["url"];
  return typeof ufsUrl === "string" || typeof url === "string";
};

export async function uploadVideo({
  videoPath,
  userId,
}: UploadRequest): Promise<string> {
  try {
    if (!videoPath.startsWith("data:video/mp4;base64,")) {
      throw new Error("Expected base64 MP4 data URL for upload");
    }

    const base64Data = videoPath.replace("data:video/mp4;base64,", "");
    const buffer = Buffer.from(base64Data, "base64");
    console.log(`Decoded base64 data: ${buffer.length} bytes`);

    const fileName = `manim_video_${userId}_${Date.now()}.mp4`;
    const file = new UTFile([new Uint8Array(buffer)], fileName, {
      type: "video/mp4",
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
    console.error("Upload failed:", error);
    throw new Error(`Video upload failed: ${(error as Error).message}`);
  }
}
