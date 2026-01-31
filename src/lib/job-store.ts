import { randomUUID } from "crypto";
import { kv } from "@vercel/kv";
import {
  JobStore,
  JobProgressEntry,
  VideoJob,
  VideoVariant,
  YoutubeStatus,
} from "@/lib/types";

class KVJobStore implements JobStore {
  private ttlSeconds = 60 * 60 * 24; // 24 hours
  private maxProgressEntries = 50;

  private appendProgressLog(
    job: VideoJob,
    atTimestamp?: string
  ): VideoJob {
    const entry: JobProgressEntry = {
      progress: job.progress,
      step: job.step,
      details: job.details,
      at: atTimestamp ?? new Date().toISOString(),
    };
    const history = Array.isArray(job.progressLog)
      ? [...job.progressLog]
      : [];
    history.push(entry);
    if (history.length > this.maxProgressEntries) {
      history.splice(0, history.length - this.maxProgressEntries);
    }
    return { ...job, progressLog: history };
  }

  async create(
    description: string,
    options?: { variant?: VideoVariant; userId?: string }
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
    const jobWithLog = this.appendProgressLog(job, now);
    await kv.set(this.key(id), jobWithLog, { ex: this.ttlSeconds });

    return jobWithLog;
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
    const updatedWithLog = this.appendProgressLog(updated);
    await kv.set(this.key(id), updatedWithLog, { ex: this.ttlSeconds });
    return updatedWithLog;
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
    const updatedWithLog = this.appendProgressLog(updated);
    await kv.set(this.key(id), updatedWithLog, { ex: this.ttlSeconds });

    return updatedWithLog;
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
    const updatedWithLog = this.appendProgressLog(updated);
    await kv.set(this.key(id), updatedWithLog, { ex: this.ttlSeconds });

    return updatedWithLog;
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
