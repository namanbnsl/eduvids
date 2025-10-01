import { UTApi, UTFile } from "uploadthing/server";
import { unlink, readFile } from "fs/promises";
import path from "path";

const utapi = new UTApi();

export interface UploadRequest {
  videoPath: string;
  userId: string;
}

export async function uploadVideo({
  videoPath,
  userId,
}: UploadRequest): Promise<string> {
  try {
    // console.log(`Uploading video from path: ${videoPath}`);

    // Check if videoPath is a base64 data URL
    if (videoPath.startsWith("data:video/mp4;base64,")) {
      // Convert base64 to binary data preserving the exact bytes
      const base64Data = videoPath.replace("data:video/mp4;base64,", "");
      const buffer = Buffer.from(base64Data, "base64");
      console.log(`Decoded base64 data: ${buffer.length} bytes`);

      // Create File object directly from buffer to preserve binary integrity
      const fileName = `manim_video_${Date.now()}.mp4`;
      const file = new UTFile([new Uint8Array(buffer)], fileName, {
        type: "video/mp4",
      });

      // Upload to UploadThing directly without saving to temp file
      console.log("Starting upload to UploadThing...");
      const response = await utapi.uploadFiles([file]);

      // Check if upload was successful
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

      const data = uploadResult.data as any;
      const uploadUrl: string = (data?.ufsUrl as string) ?? (data?.url as string);
      console.log(`Video uploaded successfully: ${uploadUrl}`);
      return uploadUrl;
    }

    // Use the provided file path for non-base64 paths
    const tempFilePath = videoPath;
    // If the renderer saved into a temp location, make sure we clean it up post-upload
    const projectTmpDir = path.join(process.cwd(), "tmp") + path.sep;
    const shouldDeleteFile =
      tempFilePath.startsWith("/tmp/") || tempFilePath.startsWith(projectTmpDir);

    // Read the file as buffer
    const fileBuffer = await readFile(tempFilePath);
    console.log(`Read file from path with size: ${fileBuffer.length} bytes`);
    if (fileBuffer.length === 0) {
      throw new Error("Attempted to upload empty file; aborting");
    }

    // Create File object with proper name - convert Buffer to Uint8Array
    const fileName = `manim_video_${userId}_${Date.now()}.mp4`;
    const file = new UTFile([new Uint8Array(fileBuffer)], fileName, {
      type: "video/mp4",
    });

    // Upload to UploadThing
    console.log("Starting upload to UploadThing...");
    const response = await utapi.uploadFiles([file]);

    // Check if upload was successful
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

    const data = uploadResult.data as any;
    const uploadUrl: string = (data?.ufsUrl as string) ?? (data?.url as string);
    console.log(`Video uploaded successfully: ${uploadUrl}`);

    // Clean up the temporary file if we created it
    if (shouldDeleteFile) {
      try {
        await unlink(tempFilePath);
        console.log("Temporary file cleaned up");
      } catch (cleanupError) {
        console.error("Failed to clean up temporary file:", cleanupError);
      }
    }

    return uploadUrl;
  } catch (error) {
    console.error("Upload failed:", error);

    // Best-effort cleanup for temp files created by renderer
    if (videoPath && typeof videoPath === "string") {
      try {
        const projectTmpDir = path.join(process.cwd(), "tmp") + path.sep;
        if (
          videoPath.startsWith("/tmp/") ||
          videoPath.startsWith(projectTmpDir)
        ) {
          await unlink(videoPath);
          console.log("Cleaned up temporary file after error");
        }
      } catch (cleanupError) {
        console.error(
          "Failed to clean up temporary file after error:",
          cleanupError
        );
      }
    }

    throw new Error(`Video upload failed: ${(error as Error).message}`);
  }
}
