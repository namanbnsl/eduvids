import { randomUUID } from "crypto";
import { kv } from "@vercel/kv";

export type JobStatus = "generating" | "ready" | "error";
export type YoutubeStatus = "pending" | "uploaded" | "failed";
export type VideoVariant = "video" | "short";

export interface VideoJob {
  id: string;
  description: string;
  status: JobStatus;
  variant: VideoVariant;
  videoUrl?: string;
  error?: string;
  // Progress fields (0-100)
  progress?: number;
  step?: string;
  details?: string;
  youtubeStatus?: YoutubeStatus;
  youtubeUrl?: string;
  youtubeVideoId?: string;
  youtubeError?: string;
  createdAt: string;
  updatedAt: string;
}

// Interface for our job store
interface JobStore {
  create(
    description: string,
    options?: { variant?: VideoVariant }
  ): Promise<VideoJob>;
  get(id: string): Promise<VideoJob | undefined>;
  setProgress(
    id: string,
    update: { progress?: number; step?: string; details?: string }
  ): Promise<VideoJob | undefined>;
  setReady(id: string, videoUrl: string): Promise<VideoJob | undefined>;
  setError(id: string, message: string): Promise<VideoJob | undefined>;
  setYoutubeStatus(
    id: string,
    update: {
      youtubeStatus?: YoutubeStatus;
      youtubeUrl?: string;
      youtubeVideoId?: string;
      youtubeError?: string;
    }
  ): Promise<VideoJob | undefined>;
}

// Persistent KV-backed store for production
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
