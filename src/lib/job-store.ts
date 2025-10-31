import { randomUUID } from "crypto";
import { kv } from "@vercel/kv";
import { JobStore, VideoJob, VideoVariant, YoutubeStatus } from "@/lib/types";

class KVJobStore implements JobStore {
  private ttlSeconds = 60 * 60 * 24; // 24 hours

  async create(
    description: string,
    options?: { variant?: VideoVariant }
  ): Promise<VideoJob> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const variant = options?.variant ?? "video";
    const job: VideoJob = {
      id,
      description,
      status: "generating",
      variant,
      progress: 0,
      step: "queued",
      createdAt: now,
      updatedAt: now,
    };
    await kv.set(this.key(id), job, { ex: this.ttlSeconds });
    return job;
  }

  async get(id: string): Promise<VideoJob | undefined> {
    const job = await kv.get<VideoJob>(this.key(id));
    return job ?? undefined;
  }

  async setProgress(
    id: string,
    update: { progress?: number; step?: string; details?: string }
  ): Promise<VideoJob | undefined> {
    const job = await this.get(id);
    if (!job) return undefined;
    const updated: VideoJob = {
      ...job,
      progress: update.progress ?? job.progress,
      step: update.step ?? job.step,
      details: update.details ?? job.details,
      updatedAt: new Date().toISOString(),
    };
    await kv.set(this.key(id), updated, { ex: this.ttlSeconds });
    return updated;
  }

  async setReady(id: string, videoUrl: string): Promise<VideoJob | undefined> {
    const job = await this.get(id);
    if (!job) return undefined;
    const updated: VideoJob = {
      ...job,
      status: "ready",
      videoUrl,
      progress: 100,
      step: "completed",
      updatedAt: new Date().toISOString(),
    };
    await kv.set(this.key(id), updated, { ex: this.ttlSeconds });
    return updated;
  }

  async setError(id: string, message: string): Promise<VideoJob | undefined> {
    const job = await this.get(id);
    if (!job) return undefined;
    const updated: VideoJob = {
      ...job,
      status: "error",
      error: message,
      step: "error",
      updatedAt: new Date().toISOString(),
    };
    await kv.set(this.key(id), updated, { ex: this.ttlSeconds });
    return updated;
  }

  async setYoutubeStatus(
    id: string,
    update: {
      youtubeStatus?: YoutubeStatus;
      youtubeUrl?: string;
      youtubeVideoId?: string;
      youtubeError?: string;
    }
  ): Promise<VideoJob | undefined> {
    const job = await this.get(id);
    if (!job) return undefined;
    const updated: VideoJob = {
      ...job,
      updatedAt: new Date().toISOString(),
    };

    if (Object.prototype.hasOwnProperty.call(update, "youtubeStatus")) {
      updated.youtubeStatus = update.youtubeStatus;
    }
    if (Object.prototype.hasOwnProperty.call(update, "youtubeUrl")) {
      updated.youtubeUrl = update.youtubeUrl;
    }
    if (Object.prototype.hasOwnProperty.call(update, "youtubeVideoId")) {
      updated.youtubeVideoId = update.youtubeVideoId;
    }
    if (Object.prototype.hasOwnProperty.call(update, "youtubeError")) {
      updated.youtubeError = update.youtubeError;
    }

    await kv.set(this.key(id), updated, { ex: this.ttlSeconds });
    return updated;
  }

  private key(id: string) {
    return `job:${id}`;
  }
}

export const jobStore: JobStore = new KVJobStore();
