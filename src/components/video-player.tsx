"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { VideoJob } from "@/lib/job-store";
import { VideoProgressCard } from "@/components/ui/video-progress-card";

export type JobStatus = "generating" | "ready" | "error";

const STEP_TITLES: Record<string, string> = {
  queued: "Queued",
  "generating voiceover": "Generating Voiceover",
  "generating script": "Generating Script",
  "validated script": "Validating Script",
  "rendering video": "Rendering Video",
  "rendered video": "Render Complete",
  "uploading video": "Uploading Video",
  "uploaded video": "Video Uploaded",
  finalizing: "Finalizing",
  completed: "Completed",
  error: "Error",
};

const PROGRESS_HISTORY_WINDOW_MS = 5 * 60 * 1000;
const SAFE_ETA_BUFFER_MS = 6 * 60 * 1000;

interface VideoPlayerProps {
  // Returned from the generate_video tool
  jobId: string;
  description: string;
  status?: JobStatus;
  // Optional direct src (if already available)
  src?: string;
}

export function VideoPlayer({
  jobId,
  status,
  src,
  description,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus>(
    status ?? (src ? "ready" : "generating")
  );
  const [videoUrl, setVideoUrl] = useState<string | undefined>(src);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | undefined>();
  const [progress, setProgress] = useState<number>(0);
  const [step, setStep] = useState<string | undefined>(undefined);
  const [etaTargetMs, setEtaTargetMs] = useState<number | null>(null);
  const progressHistoryRef = useRef<
    Array<{ progress: number; timestamp: number }>
  >([]);
  // Track when we should fire a browser notification after the UI has updated
  const [notifyWhenPlayable, setNotifyWhenPlayable] = useState<boolean>(false);

  const updateProgressMetrics = useCallback((nextProgress: number) => {
    const now = Date.now();
    if (!Number.isFinite(nextProgress)) {
      return;
    }

    const clamped = Math.min(100, Math.max(0, nextProgress));

    if (clamped <= 0 || clamped >= 100) {
      progressHistoryRef.current = [{ progress: clamped, timestamp: now }];
      setEtaTargetMs(null);
      return;
    }

    const recentHistory = progressHistoryRef.current.filter(
      (entry) => now - entry.timestamp <= PROGRESS_HISTORY_WINDOW_MS
    );
    recentHistory.push({ progress: clamped, timestamp: now });
    progressHistoryRef.current = recentHistory;

    if (recentHistory.length < 2) {
      return;
    }

    const first = recentHistory.find((entry) => entry.progress < clamped);
    const last = recentHistory[recentHistory.length - 1];

    if (!first || !last || last.timestamp <= first.timestamp) {
      return;
    }

    const progressDelta = last.progress - first.progress;
    const timeDelta = last.timestamp - first.timestamp;

    if (progressDelta <= 0 || timeDelta <= 0) {
      setEtaTargetMs(null);
      return;
    }

    const percentPerMs = progressDelta / timeDelta;
    if (percentPerMs <= 0) {
      setEtaTargetMs(null);
      return;
    }

    const remaining = Math.max(0, 100 - clamped);
    const estimateMs = remaining / percentPerMs;

    if (!Number.isFinite(estimateMs) || estimateMs <= 0) {
      setEtaTargetMs(null);
      return;
    }

    setEtaTargetMs(now + estimateMs);
  }, []);

  // Subscribe to job updates via SSE, fallback to polling
  useEffect(() => {
    if (!jobId || jobStatus === "ready" || jobStatus === "error") return;

    let cancelled = false;
    let pollInterval: ReturnType<typeof setInterval> | undefined;
    let es: EventSource | null = null;

    const parseJob = (
      job: unknown
    ):
      | (Pick<
          VideoJob,
          "progress" | "step" | "videoUrl" | "error" | "details" | "status"
        > & {
          jobId?: string;
        })
      | null => {
      if (!job || typeof job !== "object") return null;
      const value = job as Record<string, unknown>;
      const status = value.status;
      if (status !== "generating" && status !== "ready" && status !== "error") {
        return null;
      }
      const normalized: Pick<
        VideoJob,
        "progress" | "step" | "videoUrl" | "error" | "details" | "status"
      > & {
        jobId?: string;
      } = {
        status,
        progress:
          typeof value.progress === "number" ? value.progress : undefined,
        step: typeof value.step === "string" ? value.step : undefined,
        videoUrl:
          typeof value.videoUrl === "string" ? value.videoUrl : undefined,
        error: typeof value.error === "string" ? value.error : undefined,
        details: typeof value.details === "string" ? value.details : undefined,
        jobId:
          typeof value.jobId === "string"
            ? value.jobId
            : typeof value.id === "string"
            ? value.id
            : undefined,
      };
      return normalized;
    };

    const handleJob = (job: unknown) => {
      if (cancelled) return;
      const parsed = parseJob(job);
      if (!parsed || (parsed.jobId && parsed.jobId !== jobId)) {
        return;
      }
      const nextProgress =
        typeof parsed.progress === "number" ? parsed.progress : 0;
      setProgress((prev) => {
        if (nextProgress !== prev) {
          updateProgressMetrics(nextProgress);
        }
        return nextProgress;
      });
      if (parsed.step) setStep(parsed.step);
      if (parsed.status === "ready" && parsed.videoUrl) {
        setVideoUrl(parsed.videoUrl);
        setJobStatus("ready");
        // Signal that we should notify once the video element can play
        setNotifyWhenPlayable(true);
        es?.close();
        if (pollInterval) clearInterval(pollInterval);
      } else if (parsed.status === "error") {
        setJobStatus("error");
        setError(parsed.error ?? "Video generation failed");
        setErrorDetails(parsed.details);
        es?.close();
        if (pollInterval) clearInterval(pollInterval);
      }
    };

    const startPolling = () => {
      const poll = async () => {
        try {
          const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
          if (!res.ok) return;
          const data = await res.json();
          handleJob(data);
        } catch {}
      };
      poll();
      pollInterval = setInterval(poll, 5000);
    };

    try {
      es = new EventSource(`/api/jobs/${jobId}/events`);
      es.addEventListener("progress", (evt) => {
        try {
          const job = JSON.parse((evt as MessageEvent).data) as unknown;
          handleJob(job);
        } catch {}
      });
      es.addEventListener("error", () => {
        // Fallback to polling on error
        es?.close();
        startPolling();
      });
    } catch {
      startPolling();
    }

    return () => {
      cancelled = true;
      es?.close();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [jobId, jobStatus, updateProgressMetrics]);

  useEffect(() => {
    progressHistoryRef.current = [];
    setEtaTargetMs(null);
  }, [jobId]);

  useEffect(() => {
    if (jobStatus === "ready" || jobStatus === "error") {
      progressHistoryRef.current = [];
      setEtaTargetMs(null);
    }
  }, [jobStatus]);

  useEffect(() => {
    if (jobStatus !== "generating") return;
    if (etaTargetMs === null) return;

    const ensureFutureEta = () => {
      const now = Date.now();
      if (etaTargetMs <= now) {
        setEtaTargetMs(now + SAFE_ETA_BUFFER_MS);
      }
    };

    ensureFutureEta();
    const interval = setInterval(ensureFutureEta, 15000);
    return () => clearInterval(interval);
  }, [etaTargetMs, jobStatus]);

  // Request Notification permission early when component mounts (best-effort)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    // Don't prompt repeatedly; only if default
    if (Notification.permission === "default") {
      try {
        Notification.requestPermission().catch(() => {});
      } catch {}
    }
  }, []);

  // When job is ready and the video is playable, fire a browser notification
  useEffect(() => {
    if (!notifyWhenPlayable) return;

    const vid = videoRef.current;
    if (!vid) return;

    const maybeNotify = () => {
      try {
        if (typeof window === "undefined") return;
        if (!("Notification" in window)) return;
        if (Notification.permission !== "granted") return;

        const title = "Your video is ready to watch! 😀";
        const body = "Your requested video has finished rendering. 📽️";
        // Prefer showing notification when tab is hidden, but also show if visible
        new Notification(title, {
          body,
          // Using an emoji as icon fallback; projects may add a proper icon asset
          // Replace with a real icon path if available
          // icon: "/icons/video-ready.png",
        });
      } catch {}
    };

    // If already ready to play, notify immediately
    if (vid.readyState >= 3) {
      maybeNotify();
      setNotifyWhenPlayable(false);
      return;
    }

    const onCanPlay = () => {
      maybeNotify();
      setNotifyWhenPlayable(false);
    };

    vid.addEventListener("canplay", onCanPlay, { once: true });
    vid.addEventListener("loadeddata", onCanPlay, { once: true });

    return () => {
      vid.removeEventListener("canplay", onCanPlay);
      vid.removeEventListener("loadeddata", onCanPlay);
    };
  }, [notifyWhenPlayable, description]);

  const normalizedProgress = useMemo(() => {
    return Number.isFinite(progress) ? Math.min(100, Math.max(0, progress)) : 0;
  }, [progress]);

  const stageTitle = useMemo(() => {
    const rawStep = (step ?? "").trim();
    if (rawStep.length) {
      const normalizedStep = rawStep.toLowerCase();
      if (STEP_TITLES[normalizedStep]) {
        return STEP_TITLES[normalizedStep];
      }
      return rawStep
        .split(/\s+/)
        .map((word) =>
          word.length > 0
            ? `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}`
            : ""
        )
        .join(" ");
    }

    if (normalizedProgress >= 95) return "Finalizing";
    if (normalizedProgress >= 82) return "Video Uploaded";
    if (normalizedProgress >= 80) return "Uploading Video";
    if (normalizedProgress >= 72) return "Render Complete";
    if (normalizedProgress >= 50) return "Rendering Video";
    if (normalizedProgress >= 35) return "Validating Script";
    if (normalizedProgress >= 20) return "Generating Script";
    if (normalizedProgress >= 5) return "Generating Voiceover";
    return "Queued";
  }, [normalizedProgress, step]);

  const etaDisplay = useMemo(() => {
    if (jobStatus === "ready") return null;
    if (normalizedProgress <= 0 || normalizedProgress >= 100) return null;
    if (etaTargetMs === null) {
      return "Calculating…";
    }

    const targetDate = new Date(etaTargetMs);
    if (Number.isNaN(targetDate.getTime())) {
      return "Calculating…";
    }

    const formatter = new Intl.DateTimeFormat(undefined, {
      hour: "numeric",
      minute: "2-digit",
      ...(Math.abs(etaTargetMs - Date.now()) > 24 * 3600 * 1000
        ? { month: "short", day: "numeric" }
        : {}),
    });

    return `~${formatter.format(targetDate)}`;
  }, [etaTargetMs, jobStatus, normalizedProgress]);

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-600">❌ {error}</p>
        {errorDetails ? (
          <p className="mt-2 whitespace-pre-wrap text-sm text-red-500">
            {errorDetails}
          </p>
        ) : null}
        <button
          onClick={() => {
            setError(null);
            setErrorDetails(undefined);
          }}
          className="mt-2 px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
        >
          Retry
        </button>
      </div>
    );
  }

  if (jobStatus !== "ready" || !videoUrl) {
    return (
      <VideoProgressCard
        title="Video Generating..."
        subtitle={stageTitle}
        progress={normalizedProgress}
        eta={`ETA: ${etaDisplay ?? "Calculating…"}`}
      />
      // <div
      //   className={
      //     "w-full rounded-lg border border-border bg-card text-card-foreground p-6 flex items-center justify-center"
      //   }
      //   style={{ aspectRatio: "16 / 9" }}
      //   aria-busy="true"
      //   aria-label="Video container generating"
      // >
      //   <div className="mx-auto max-w-md text-center space-y-4">
      //     <h2 className="text-balance text-lg font-medium">
      //       Video generating. Please wait
      //     </h2>
      //     <p className="text-sm text-muted-foreground">
      //       {stageTitle ?? "This may take a moment."}
      //     </p>

      //     {/* Determinate progress bar with subtle animation */}
      //     <div className="mt-4">
      //       <div
      //         className="h-2 w-full overflow-hidden rounded bg-muted"
      //         role="progressbar"
      //         aria-label="Generating video"
      //         aria-valuemin={0}
      //         aria-valuemax={100}
      //         aria-valuenow={normalizedProgress}
      //       >
      //         <div
      //           className="h-full rounded bg-primary transition-all duration-700 ease-out"
      //           style={{
      //             width: `${normalizedProgress}%`,
      //           }}
      //         />
      //       </div>
      //       <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
      //         <span>{stageTitle ?? "Processing"}</span>
      //         <span>{roundedProgress}%</span>
      //       </div>
      //       {etaDisplay ? (
      //         <div className="text-xs text-muted-foreground">
      //           ETA: {etaDisplay} · Rendering times may vary.
      //         </div>
      //       ) : null}
      //     </div>

      //     {/* Screen reader live status */}
      //     <p className="sr-only" aria-live="polite" role="status">
      //       {`Video generating. ${
      //         stageTitle ?? "Please wait"
      //       }. ${roundedProgress}%${etaDisplay ? `. ETA approximately ${etaDisplay}` : ""}`}
      //     </p>
      //   </div>
      // </div>
    );
  }

  return (
    <div
      className="w-full rounded-lg border border-border bg-card text-card-foreground p-2"
      style={{ aspectRatio: "16 / 9" }}
    >
      <video
        ref={videoRef}
        src={videoUrl}
        controls
        className="w-full h-full rounded-md"
      />
    </div>
  );
}
