"use client";

import { useEffect, useRef, useState } from "react";

type JobStatus = "generating" | "ready" | "error";

interface VideoPlayerProps {
  // Returned from the generate_video tool
  jobId: string;
  description: string;
  status?: JobStatus;
  // Optional direct src (if already available)
  src?: string;
}

export function VideoPlayer({ jobId, status, src }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus>(
    status ?? (src ? "ready" : "generating")
  );
  const [videoUrl, setVideoUrl] = useState<string | undefined>(src);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [step, setStep] = useState<string | undefined>(undefined);

  // Subscribe to job updates via SSE, fallback to polling
  useEffect(() => {
    if (!jobId || jobStatus === "ready" || jobStatus === "error") return;

    let cancelled = false;
    let pollInterval: any;
    let es: EventSource | null = null;

    const handleJob = (job: any) => {
      if (cancelled || !job) return;
      setProgress(typeof job.progress === "number" ? job.progress : 0);
      if (job.step) setStep(job.step);
      if (job.status === "ready" && job.videoUrl) {
        setVideoUrl(job.videoUrl);
        setJobStatus("ready");
        es?.close();
        if (pollInterval) clearInterval(pollInterval);
      } else if (job.status === "error") {
        setJobStatus("error");
        setError(job.error ?? "Video generation failed");
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
          const job = JSON.parse((evt as MessageEvent).data);
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
  }, [jobId, jobStatus]);

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-600">❌ {error}</p>
        <button
          onClick={() => setError(null)}
          className="mt-2 px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
        >
          Retry
        </button>
      </div>
    );
  }

  if (jobStatus !== "ready" || !videoUrl) {
    return (
      <div
        className={
          "w-full rounded-lg border border-border bg-card text-card-foreground p-6 flex items-center justify-center"
        }
        style={{ aspectRatio: "16 / 9" }}
        aria-busy="true"
        aria-label="Video container generating"
      >
        <div className="mx-auto max-w-md text-center space-y-4">
          <h2 className="text-balance text-lg font-medium">
            Video generating. Please wait
          </h2>
          <p className="text-sm text-muted-foreground">
            {step ? step : "This may take a moment."}
          </p>

          {/* Determinate progress bar with subtle animation */}
          <div className="mt-4">
            <div
              className="h-2 w-full overflow-hidden rounded bg-muted"
              role="progressbar"
              aria-label="Generating video"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress}
            >
              <div
                className="h-full rounded bg-primary transition-all duration-700 ease-out"
                style={{
                  width: `${Math.max(2, Math.min(100, progress || 0))}%`,
                }}
              />
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              {Math.round(progress || 0)}%
            </div>
          </div>

          {/* Screen reader live status */}
          <p className="sr-only" aria-live="polite" role="status">
            {`Video generating. ${step ?? "Please wait"}. ${Math.round(
              progress || 0
            )}%`}
          </p>
        </div>
      </div>
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
