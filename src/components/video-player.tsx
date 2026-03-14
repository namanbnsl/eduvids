"use client";

// Hooks
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Types
import type {
  JobProgressEntry,
  JobStatus,
  VideoJob,
  VideoVariant,
  YoutubeStatus,
} from "@/lib/types";

// Components
import { VideoProgressCard } from "@/components/ui/video-progress-card";
import { SubscribePrompt } from "@/components/subscribe-prompt";

// Icons
import { Monitor, Smartphone, Youtube } from "lucide-react";

// Step Lookup Table
const STEP_TITLES: Record<string, string> = {
  queued: "Warming up the engines…",
  "generating voiceover": "Crafting the perfect voiceover",
  "voiceover ready": "Voiceover locked in ✓",
  "generating script": "Cooking up the script",
  "script drafted": "Polishing the draft",
  "verifying script": "Double-checking the math",
  "script approved": "Script approved ✓",
  "script ready for render": "Ready for the big render",
  "preparing render environment": "Setting the stage",
  "provisioning sandbox": "Spinning up a fresh sandbox",
  "uploading script to sandbox": "Beaming the script over",
  "running syntax check": "Proofreading every line",
  "enforcing safety guards": "Running safety checks",
  "validating scene": "Making sure everything looks right",
  "installing plugins": "Loading the toolbox",
  "checking latex environment": "Warming up LaTeX",
  "validated script": "All checks passed ✓",
  "rendering frames": "Bringing your video to life",
  "rendering video": "Rendering the magic",
  "render completed": "Render complete ✓",
  "rendered video": "Render complete ✓",
  "collecting render output": "Gathering the frames",
  "render warnings": "Minor touch-ups needed",
  "validating video": "Quality check in progress",
  "enhancing video": "Adding the final polish",
  "applying watermark": "Stamping the brand",
  "verifying watermark": "Verifying the stamp",
  "uploading video": "Uploading to the cloud",
  "uploaded video": "Upload complete ✓",
  finalizing: "Almost there…",
  completed: "All done!",
  error: "Something went wrong",
};

const FUN_MESSAGES = [
  "This is going to be awesome…",
  "Mixing pixels and equations…",
  "Teaching math to robots…",
  "Making numbers look beautiful…",
  "Converting caffeine to code…",
  "Rendering at ludicrous speed…",
  "Aligning the variables…",
  "Doing the heavy lifting so you don't have to…",
  "Crunching numbers like a boss…",
  "Patience is a virtue, but this won't take long…",
  "Almost faster than the speed of light…",
  "Turning your idea into pixels…",
  "Good things come to those who wait…",
  "Worth the wait, we promise…",
  "The math checks out, rendering now…",
  "Your video is going to be 🔥",
  "Frame by frame perfection…",
  "Behind the scenes: pure magic…",
];

const formatStepName = (step?: string): string | undefined => {
  const rawStep = step?.trim();
  if (!rawStep) return undefined;
  const normalized = rawStep.toLowerCase();
  if (STEP_TITLES[normalized]) {
    return STEP_TITLES[normalized];
  }
  return rawStep
    .split(/\s+/)
    .map((word) =>
      word.length > 0 ? `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}` : "",
    )
    .join(" ");
};
const PROGRESS_HISTORY_WINDOW_MS = 5 * 60 * 1000;

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
    status ?? (src ? "ready" : "generating"),
  );
  const [videoUrl, setVideoUrl] = useState<string | undefined>(src);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [step, setStep] = useState<string | undefined>(undefined);
  const [progressDetails, setProgressDetails] = useState<string | undefined>();
  const [youtubeStatus, setYoutubeStatus] = useState<YoutubeStatus | undefined>(
    undefined,
  );
  const [youtubeUrl, setYoutubeUrl] = useState<string | undefined>(undefined);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [youtubeError, setYoutubeError] = useState<string | undefined>(
    undefined,
  );
  const [currentVariant, setCurrentVariant] = useState<VideoVariant>(
    initialVariant ?? "video",
  );
  const progressHistoryRef = useRef<
    Array<{ progress: number; timestamp: number }>
  >([]);
  const [displayProgress, setDisplayProgress] = useState<number>(0);
  // Track when we should fire a browser notification after the UI has updated
  const [notifyWhenPlayable, setNotifyWhenPlayable] = useState<boolean>(false);
  useEffect(() => {
    if (initialVariant) {
      setCurrentVariant(initialVariant);
    }
  }, [initialVariant]);

  const updateProgressMetrics = useCallback((nextProgress: number) => {
    const now = Date.now();
    if (!Number.isFinite(nextProgress)) {
      return;
    }

    const clamped = Math.min(100, Math.max(0, nextProgress));

    if (clamped <= 0 || clamped >= 100) {
      progressHistoryRef.current = [{ progress: clamped, timestamp: now }];
      return;
    }

    const recentHistory = progressHistoryRef.current.filter(
      (entry) => now - entry.timestamp <= PROGRESS_HISTORY_WINDOW_MS,
    );
    recentHistory.push({ progress: clamped, timestamp: now });
    progressHistoryRef.current = recentHistory;

    if (recentHistory.length < 2) {
      return;
    }
  }, []);

  const normalizeJob = useCallback(
    (
      job: unknown,
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
          | "progressLog"
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
        | "progressLog"
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

      if (Array.isArray(value.progressLog)) {
        const sanitizedLog = value.progressLog
          .map((entry) => {
            if (!entry || typeof entry !== "object") return null;
            const raw = entry as Record<string, unknown>;
            const at = typeof raw.at === "string" ? raw.at : undefined;
            if (!at) return null;
            const entryProgress =
              typeof raw.progress === "number" ? raw.progress : undefined;
            const entryStep =
              typeof raw.step === "string" ? raw.step : undefined;
            const entryDetails =
              typeof raw.details === "string" ? raw.details : undefined;
            return {
              at,
              progress: entryProgress,
              step: entryStep,
              details: entryDetails,
            } as JobProgressEntry;
          })
          .filter((entry): entry is JobProgressEntry => Boolean(entry));
        if (sanitizedLog.length) {
          normalized.progressLog = sanitizedLog;
        }
      }

      return normalized;
    },
    [],
  );

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
      setProgressDetails((prev) =>
        parsed.details !== undefined ? parsed.details : prev,
      );
      setYoutubeStatus(parsed.youtubeStatus);
      setYoutubeUrl(parsed.youtubeUrl);
      setYoutubeError(parsed.youtubeError);
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
    setYoutubeStatus(undefined);
    setCurrentVariant(initialVariant ?? "video");
    setDisplayProgress(0);
    setProgressDetails(undefined);
  }, [jobId, initialVariant]);

  useEffect(() => {
    if (jobStatus === "ready" || jobStatus === "error") {
      progressHistoryRef.current = [];
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
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    // Don't prompt repeatedly; only if default
    if (Notification.permission === "default") {
      try {
        Notification.requestPermission().catch(() => {});
      } catch {}
    }
  }, []);

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

        new Notification(title, {
          body,
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

  const stageTitle = useMemo(() => {
    const formatted = formatStepName(step);
    if (formatted) {
      return formatted;
    }
    if (jobStatus === "ready") {
      return STEP_TITLES["completed"];
    }
    if (jobStatus === "error") {
      return STEP_TITLES["error"];
    }
    return STEP_TITLES["queued"];
  }, [step, jobStatus]);

  const [funMessageIndex, setFunMessageIndex] = useState(() =>
    Math.floor(Math.random() * FUN_MESSAGES.length),
  );
  useEffect(() => {
    if (jobStatus !== "generating") return;
    const interval = setInterval(() => {
      setFunMessageIndex((prev) => (prev + 1) % FUN_MESSAGES.length);
    }, 3500);
    return () => clearInterval(interval);
  }, [jobStatus]);

  const stageSubtitle =
    jobStatus === "generating"
      ? (FUN_MESSAGES[funMessageIndex] ?? stageTitle)
      : (progressDetails ?? stageTitle);

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
          let projected = prev;

          const safetyCeil = Math.min(99, actual + 8);
          projected = Math.min(projected, safetyCeil);

          if (projected > next) {
            const growthRate = Math.max(1, (projected - next) * 0.08);
            next = Math.min(projected, next + growthRate * deltaSeconds);
          } else if (actual + 0.2 < next) {
            next = Math.max(actual, next - 20 * deltaSeconds);
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

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-600">❌ Something went wrong</p>
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

        <VideoProgressCard
          title={`Generating your ${currentVariant == "short" ? "Short" : "Video"}`}
          subtitle={stageSubtitle}
          stepLabel={stageTitle}
          progress={displayProgress}
        />
        <SubscribePrompt />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <video
        ref={videoRef}
        src={videoUrl}
        className={
          currentVariant === "short"
            ? "w-full max-w-xs rounded-lg border shadow aspect-[9/16]"
            : "w-full max-w-3xl rounded-lg border shadow"
        }
        controls
        playsInline
        poster=""
        preload="metadata"
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
