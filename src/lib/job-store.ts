// Simple in-memory job store. Lives in memory of the server process only.
// NOTE: This will reset on server restarts or hot reloads.

import { randomUUID } from "crypto";
import { kv } from "@vercel/kv";

export type JobStatus = "generating" | "ready" | "error";
export type YoutubeStatus = "pending" | "uploaded" | "failed";

export interface VideoJob {
  id: string;
  description: string;
  status: JobStatus;
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
  create(description: string): Promise<VideoJob>;
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

  async create(description: string): Promise<VideoJob> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const job: VideoJob = {
      id,
      description,
      status: "generating",
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

// In-memory fallback for local dev when KV is not configured
class InMemoryJobStore implements JobStore {
  private jobs = new Map<string, VideoJob>();

  async create(description: string): Promise<VideoJob> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const job: VideoJob = {
      id,
      description,
      status: "generating",
      progress: 0,
      step: "queued",
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(id, job);
    return job;
  }

  async get(id: string): Promise<VideoJob | undefined> {
    return this.jobs.get(id);
  }

  async setProgress(
    id: string,
    update: { progress?: number; step?: string; details?: string }
  ): Promise<VideoJob | undefined> {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    if (typeof update.progress === "number") job.progress = update.progress;
    if (typeof update.step === "string") job.step = update.step;
    if (typeof update.details === "string") job.details = update.details;
    job.updatedAt = new Date().toISOString();
    this.jobs.set(id, job);
    return job;
  }

  async setReady(id: string, videoUrl: string): Promise<VideoJob | undefined> {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    job.status = "ready";
    job.videoUrl = videoUrl;
    job.progress = 100;
    job.step = "completed";
    job.updatedAt = new Date().toISOString();
    this.jobs.set(id, job);
    return job;
  }

  async setError(id: string, message: string): Promise<VideoJob | undefined> {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    job.status = "error";
    job.error = message;
    job.step = "error";
    job.updatedAt = new Date().toISOString();
    this.jobs.set(id, job);
    return job;
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
    const job = this.jobs.get(id);
    if (!job) return undefined;

    if (Object.prototype.hasOwnProperty.call(update, "youtubeStatus")) {
      job.youtubeStatus = update.youtubeStatus;
    }
    if (Object.prototype.hasOwnProperty.call(update, "youtubeUrl")) {
      job.youtubeUrl = update.youtubeUrl;
    }
    if (Object.prototype.hasOwnProperty.call(update, "youtubeVideoId")) {
      job.youtubeVideoId = update.youtubeVideoId;
    }
    if (Object.prototype.hasOwnProperty.call(update, "youtubeError")) {
      job.youtubeError = update.youtubeError;
    }

    job.updatedAt = new Date().toISOString();
    this.jobs.set(id, job);
    return job;
  }
}

// Select KV store if configured, otherwise fallback to in-memory (useful for local dev)
const hasKV = Boolean(
  process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN
);
export const jobStore: JobStore = hasKV
  ? new KVJobStore()
  : new InMemoryJobStore();
