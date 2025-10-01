// Simple in-memory job store. Lives in memory of the server process only.
// NOTE: This will reset on server restarts or hot reloads.

import { randomUUID } from "crypto";
import { kv } from "@vercel/kv";

export type JobStatus = "generating" | "ready" | "error";

export interface VideoJob {
  id: string;
  description: string;
  status: JobStatus;
  videoUrl?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

// Interface for our job store
interface JobStore {
  create(description: string): Promise<VideoJob>;
  get(id: string): Promise<VideoJob | undefined>;
  setReady(id: string, videoUrl: string): Promise<VideoJob | undefined>;
  setError(id: string, message: string): Promise<VideoJob | undefined>;
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

  async setReady(id: string, videoUrl: string): Promise<VideoJob | undefined> {
    const job = await this.get(id);
    if (!job) return undefined;
    const updated: VideoJob = {
      ...job,
      status: "ready",
      videoUrl,
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
      updatedAt: new Date().toISOString(),
    };
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
      createdAt: now,
      updatedAt: now,
    };
    this.jobs.set(id, job);
    return job;
  }

  async get(id: string): Promise<VideoJob | undefined> {
    return this.jobs.get(id);
  }

  async setReady(id: string, videoUrl: string): Promise<VideoJob | undefined> {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    job.status = "ready";
    job.videoUrl = videoUrl;
    job.updatedAt = new Date().toISOString();
    this.jobs.set(id, job);
    return job;
  }

  async setError(id: string, message: string): Promise<VideoJob | undefined> {
    const job = this.jobs.get(id);
    if (!job) return undefined;
    job.status = "error";
    job.error = message;
    job.updatedAt = new Date().toISOString();
    this.jobs.set(id, job);
    return job;
  }
}

// Select KV store if configured, otherwise fallback to in-memory (useful for local dev)
const hasKV = Boolean(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
export const jobStore: JobStore = hasKV ? new KVJobStore() : new InMemoryJobStore();
