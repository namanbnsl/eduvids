"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { VideoJob, VideoVariant, YoutubeStatus } from "@/lib/job-store";
import { VideoProgressCard } from "@/components/ui/video-progress-card";
import { cn } from "@/lib/utils";
import { Monitor, Smartphone, Youtube } from "lucide-react";
// Animation: Loader
function AnimatedDots() {
  return (
    <span className="inline-flex gap-1 items-center justify-center">
      <span className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.24s]"></span>
      <span className="w-2 h-2 bg-primary rounded-full animate-bounce [animation-delay:-0.12s]"></span>
      <span className="w-2 h-2 bg-primary rounded-full animate-bounce"></span>
    </span>
  );
}
// Fun loading phrases
const FRIENDLY_LOADING_MESSAGES = [
  "Cooking up your video magic!",
  "Adding fun animations...",
  "Composing awesome scenes...",
  "Mixing colors & stories...",
  "Tuning up the sound...",
  "Putting on the finishing touches!",
  "Making it just for you...",
  "Rolling the cameras...",
  "Almost there—get ready!",
];

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

const STEP_SEQUENCE: Array<{ id: string; label: string }> = [
  { id: "queued", label: STEP_TITLES["queued"] },
  { id: "generating voiceover", label: STEP_TITLES["generating voiceover"] },
  { id: "generating script", label: STEP_TITLES["generating script"] },
  { id: "validated script", label: STEP_TITLES["validated script"] },
  { id: "rendering video", label: STEP_TITLES["rendering video"] },
  { id: "rendered video", label: STEP_TITLES["rendered video"] },
  { id: "uploading video", label: STEP_TITLES["uploading video"] },
  { id: "uploaded video", label: STEP_TITLES["uploaded video"] },
  { id: "finalizing", label: STEP_TITLES["finalizing"] },
  { id: "completed", label: STEP_TITLES["completed"] },
];

const PROGRESS_HISTORY_WINDOW_MS = 5 * 60 * 1000;
const SAFE_ETA_BUFFER_MS = 6 * 60 * 1000;
const SUBSCRIBE_URL = "https://www.youtube.com/@eduvids-ai?sub_confirmation=1";

function SubscribePrompt() {
  return (
    <div className="rounded-lg border border-border/70 bg-background/70 px-4 py-3 shadow-sm">
      <p className="text-sm text-muted-foreground">
        Subscribe to our YouTube channel to get the video <br />
        as soon as it’s automatically uploaded.
      </p>
      <a
        href={SUBSCRIBE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-3 inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        <Youtube className="size-4" />
        Subscribe on YouTube
      </a>
    </div>
  );
}

interface VideoPlayerProps {
  // Returned from the generate_video tool
  jobId: string;
  description: string;
  status?: JobStatus;
  // Optional direct src (if already available)
  src?: string;
  variant?: VideoVariant;
}

export function VideoPlayer({
  jobId,
  status,
  src,
  description,
  variant: initialVariant,
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
  const [youtubeStatus, setYoutubeStatus] = useState<YoutubeStatus | undefined>(
    undefined
  );
  const [youtubeUrl, setYoutubeUrl] = useState<string | undefined>(undefined);
  const [youtubeError, setYoutubeError] = useState<string | undefined>(
    undefined
  );
  const [currentVariant, setCurrentVariant] = useState<VideoVariant>(
    initialVariant ?? "video"
  );
  const [jobDetails, setJobDetails] = useState<string | undefined>(undefined);
  const progressHistoryRef = useRef<
    Array<{ progress: number; timestamp: number }>
  >([]);
  const etaSnapshotRef = useRef<{
    progress: number;
    timestamp: number;
  } | null>(null);
  const [displayProgress, setDisplayProgress] = useState<number>(0);
  // Track when we should fire a browser notification after the UI has updated
  const [notifyWhenPlayable, setNotifyWhenPlayable] = useState<boolean>(false);
  // Start friendly animated text index
  const [messageIdx, setMessageIdx] = useState(() =>
    Math.floor(Math.random() * FRIENDLY_LOADING_MESSAGES.length)
  );

  useEffect(() => {
    if (initialVariant) {
      setCurrentVariant(initialVariant);
    }
  }, [initialVariant]);

  useEffect(() => {
    if (jobStatus !== "ready") {
      const interval = setInterval(() => {
        setMessageIdx((prev) => (prev + 1) % FRIENDLY_LOADING_MESSAGES.length);
      }, 1900);
      return () => clearInterval(interval);
    }
  }, [jobStatus]);

  const updateProgressMetrics = useCallback((nextProgress: number) => {
    const now = Date.now();
    if (!Number.isFinite(nextProgress)) {
      return;
    }

    const clamped = Math.min(100, Math.max(0, nextProgress));

    if (clamped <= 0 || clamped >= 100) {
      progressHistoryRef.current = [{ progress: clamped, timestamp: now }];
      setEtaTargetMs(null);
      etaSnapshotRef.current = null;
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
      etaSnapshotRef.current = null;
      return;
    }

    const remaining = Math.max(0, 100 - clamped);
    const estimateMs = remaining / percentPerMs;

    if (!Number.isFinite(estimateMs) || estimateMs <= 0) {
      setEtaTargetMs(null);
      etaSnapshotRef.current = null;
      return;
    }

    setEtaTargetMs(now + estimateMs);
    etaSnapshotRef.current = { progress: clamped, timestamp: now };
  }, []);

  const normalizeJob = useCallback(
    (
      job: unknown
    ):
      | (Pick<
          VideoJob,
          | "progress"
          | "step"
          | "videoUrl"
          | "error"
          | "details"
          | "status"
          | "youtubeStatus"
          | "youtubeUrl"
          | "youtubeError"
          | "variant"
        > & { jobId?: string })
      | null => {
      if (!job || typeof job !== "object") return null;
      const value = job as Record<string, unknown>;
      const status = value.status;
      if (status !== "generating" && status !== "ready" && status !== "error") {
        return null;
      }

      const rawYoutubeStatus = value.youtubeStatus;
      const youtubeStatus: YoutubeStatus | undefined =
        typeof rawYoutubeStatus === "string" &&
        (rawYoutubeStatus === "pending" ||
          rawYoutubeStatus === "uploaded" ||
          rawYoutubeStatus === "failed")
          ? (rawYoutubeStatus as YoutubeStatus)
          : undefined;

      const rawVariant = value.variant;
      const variant: VideoVariant = rawVariant === "short" ? "short" : "video";

      const normalized: Pick<
        VideoJob,
        | "progress"
        | "step"
        | "videoUrl"
        | "error"
        | "details"
        | "status"
        | "youtubeStatus"
        | "youtubeUrl"
        | "youtubeError"
        | "variant"
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
        youtubeStatus,
        youtubeUrl:
          typeof value.youtubeUrl === "string" ? value.youtubeUrl : undefined,
        youtubeError:
          typeof value.youtubeError === "string"
            ? value.youtubeError
            : undefined,
        variant,
        jobId:
          typeof value.jobId === "string"
            ? value.jobId
            : typeof value.id === "string"
            ? value.id
            : undefined,
      };

      return normalized;
    },
    []
  );

  // Subscribe to job updates via SSE, fallback to polling
  useEffect(() => {
    if (!jobId || jobStatus === "ready" || jobStatus === "error") return;

    let cancelled = false;
    let pollInterval: ReturnType<typeof setInterval> | undefined;
    let es: EventSource | null = null;

    const handleJob = (job: unknown) => {
      if (cancelled) return;
      const parsed = normalizeJob(job);
      if (!parsed || (parsed.jobId && parsed.jobId !== jobId)) {
        return;
      }
      if (parsed.variant) {
        setCurrentVariant(parsed.variant);
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
      setYoutubeStatus(parsed.youtubeStatus);
      setYoutubeUrl(parsed.youtubeUrl);
      setYoutubeError(parsed.youtubeError);
      setJobDetails(parsed.details);
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
  }, [jobId, jobStatus, updateProgressMetrics, normalizeJob]);

  useEffect(() => {
    progressHistoryRef.current = [];
    setEtaTargetMs(null);
    etaSnapshotRef.current = null;
    setYoutubeStatus(undefined);
    setYoutubeUrl(undefined);
    setYoutubeError(undefined);
    setCurrentVariant(initialVariant ?? "video");
    setJobDetails(undefined);
    setDisplayProgress(0);
  }, [jobId, initialVariant]);

  useEffect(() => {
    if (jobStatus === "ready" || jobStatus === "error") {
      progressHistoryRef.current = [];
      setEtaTargetMs(null);
      etaSnapshotRef.current = null;
    }
  }, [jobStatus]);

  useEffect(() => {
    if (!jobId) return;
    if (jobStatus !== "ready") return;
    if (youtubeStatus === "uploaded" || youtubeStatus === "failed") return;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 120;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const poll = async () => {
      if (cancelled) return;
      attempts += 1;
      try {
        const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const parsed = normalizeJob(data);
        if (!parsed || (parsed.jobId && parsed.jobId !== jobId)) {
          return;
        }
        setYoutubeStatus(parsed.youtubeStatus);
        setYoutubeUrl(parsed.youtubeUrl);
        setYoutubeError(parsed.youtubeError);
        if (
          parsed.youtubeStatus === "uploaded" ||
          parsed.youtubeStatus === "failed"
        ) {
          if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
          }
          cancelled = true;
          return;
        }
      } catch {}

      if (attempts >= maxAttempts && intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    poll();
    intervalId = setInterval(poll, 5000);

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [jobId, jobStatus, youtubeStatus, normalizeJob]);

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
  const normalizedProgressRef = useRef(normalizedProgress);
  useEffect(() => {
    normalizedProgressRef.current = normalizedProgress;
  }, [normalizedProgress]);

  const etaTargetRef = useRef<number | null>(etaTargetMs);
  useEffect(() => {
    etaTargetRef.current = etaTargetMs;
    if (etaTargetMs === null) {
      etaSnapshotRef.current = null;
    }
  }, [etaTargetMs]);

  const stageTitle = useMemo(() => {
    const rawStep = (step ?? (jobStatus === "ready" ? "completed" : "")).trim();
    if (rawStep.length) {
      const normalized = rawStep.toLowerCase();
      if (STEP_TITLES[normalized]) {
        return STEP_TITLES[normalized];
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
    if (jobStatus === "ready") {
      return STEP_TITLES["completed"];
    }
    return STEP_TITLES["queued"];
  }, [step, jobStatus]);

  type StepProgressStatus = "complete" | "current" | "pending";
  const currentStepId = useMemo(() => {
    if (jobStatus === "error") return "error";
    if (jobStatus === "ready") return "completed";
    const raw = (step ?? "").trim().toLowerCase();
    return raw.length ? raw : "queued";
  }, [jobStatus, step]);

  const stepProgressItems = useMemo(() => {
    const activeIndex = STEP_SEQUENCE.findIndex(
      (entry) => entry.id === currentStepId
    );
    return STEP_SEQUENCE.map((entry, index) => {
      let status: StepProgressStatus = "pending";
      if (activeIndex === -1) {
        status = index === 0 ? "current" : "pending";
      } else if (index < activeIndex) {
        status = "complete";
      } else if (index === activeIndex) {
        status = "current";
      }

      return { ...entry, status };
    });
  }, [currentStepId]);

  useEffect(() => {
    if (jobStatus !== "generating") {
      setDisplayProgress(normalizedProgress);
      return;
    }

    let frame: number;
    let lastTimestamp = Date.now();

    const animate = () => {
      const now = Date.now();
      const deltaSeconds = Math.max(0, (now - lastTimestamp) / 1000);
      lastTimestamp = now;

      setDisplayProgress((prev) => {
        const actual = normalizedProgressRef.current;
        let next = prev;

        if (actual > prev) {
          const catchUpRate = Math.max(12, (actual - prev) * 0.6);
          next = Math.min(actual, prev + catchUpRate * deltaSeconds);
        } else {
          const etaTarget = etaTargetRef.current;
          const etaSnapshot = etaSnapshotRef.current;
          let projected = prev;

          if (etaTarget && etaSnapshot && etaTarget > etaSnapshot.timestamp) {
            const totalWindow = etaTarget - etaSnapshot.timestamp;
            const elapsed = now - etaSnapshot.timestamp;
            const ratio = Math.min(1, Math.max(0, elapsed / totalWindow));
            projected =
              etaSnapshot.progress + ratio * (100 - etaSnapshot.progress);
          }

          const safetyCeil = Math.min(99, actual + 8);
          projected = Math.min(projected, safetyCeil);

          if (projected > next) {
            const growthRate = Math.max(1, (projected - next) * 0.08);
            next = Math.min(projected, next + growthRate * deltaSeconds);
          } else if (actual + 0.2 < next) {
            next = Math.max(actual, next - 20 * deltaSeconds);
          }

          if ((!etaTarget || !etaSnapshot) && actual < 99) {
            const fallbackTarget = Math.min(safetyCeil, actual + 4);
            if (fallbackTarget > next) {
              next = Math.min(fallbackTarget, next + 0.8 * deltaSeconds);
            }
          }
        }

        if (!Number.isFinite(next)) {
          return prev;
        }

        return Math.max(0, Math.min(100, next));
      });

      frame = requestAnimationFrame(animate);
    };

    frame = requestAnimationFrame(animate);
    return () => {
      if (frame) cancelAnimationFrame(frame);
    };
  }, [jobStatus, normalizedProgress]);

  useEffect(() => {
    if (jobStatus === "ready") {
      setDisplayProgress(100);
      return;
    }
    if (jobStatus === "error") {
      setDisplayProgress(normalizedProgress);
    }
  }, [jobStatus, normalizedProgress]);

  // const etaDisplay = useMemo(() => {
  //   if (jobStatus === "ready") return null;
  //   if (normalizedProgress <= 0 || normalizedProgress >= 100) return null;
  //   if (etaTargetMs === null) {
  //     return "Calculating…";
  //   }

  //   const targetDate = new Date(etaTargetMs);
  //   if (Number.isNaN(targetDate.getTime())) {
  //     return "Calculating…";
  //   }

  //   const formatter = new Intl.DateTimeFormat(undefined, {
  //     hour: "numeric",
  //     minute: "2-digit",
  //     ...(Math.abs(etaTargetMs - Date.now()) > 24 * 3600 * 1000
  //       ? { month: "short", day: "numeric" }
  //       : {}),
  //   });

  //   return `~${formatter.format(targetDate)}`;
  // }, [etaTargetMs, jobStatus, normalizedProgress]);

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-600">❌ {error}</p>
        {errorDetails ? (
          <p className="mt-2 whitespace-pre-wrap text-sm text-red-500">
            {errorDetails}
          </p>
        ) : null}
      </div>
    );
  }

  if (jobStatus !== "ready" || !videoUrl) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          {currentVariant === "short" ? (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-secondary text-secondary-foreground text-xs font-medium">
              <Smartphone className="size-3.5" />
              Short
            </div>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-secondary text-secondary-foreground text-xs font-medium">
              <Monitor className="size-3.5" />
              Video
            </div>
          )}
        </div>
        {/* Animated loader + rotating friendly message */}
        <div className="flex flex-col items-center justify-center">
          <AnimatedDots />
          <span className="mt-2 text-base font-medium text-foreground/80 animate-pulse">
            {FRIENDLY_LOADING_MESSAGES[messageIdx]}
          </span>
        </div>
        <VideoProgressCard
          title="Generating..."
          subtitle={FRIENDLY_LOADING_MESSAGES[messageIdx]}
          stepLabel=" "
          progress={displayProgress}
        />
        {jobDetails ? (
          <p className="text-sm text-muted-foreground">{jobDetails}</p>
        ) : null}
        <SubscribePrompt />
      </div>
    );
  }

  // CONCRETE PLAYER: If ready, show the video
  return (
    <div className="space-y-4">
      <video
        ref={videoRef}
        src={videoUrl}
        className="w-full max-w-3xl rounded-lg border shadow"
        controls
        playsInline
        poster=""
        style={{ background: "#000" }}
      >
        Sorry, your browser does not support embedded videos.
      </video>
      {youtubeUrl && (
        <a
          href={youtubeUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 mt-2 text-primary-foreground font-semibold text-base shadow transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/75"
        >
          <Youtube className="size-5" />
          Watch on YouTube
        </a>
      )}
    </div>
  );
}
