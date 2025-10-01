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
  const [jobStatus, setJobStatus] = useState<JobStatus>(status ?? (src ? "ready" : "generating"));
  const [videoUrl, setVideoUrl] = useState<string | undefined>(src);
  const [error, setError] = useState<string | null>(null);

  // Poll job status if we are still generating and we have a jobId
  useEffect(() => {
    if (!jobId || jobStatus === "ready" || jobStatus === "error") return;

    let cancelled = false;
    let interval: any;

    const poll = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        if (!res.ok) {
          // 404 means job might not be registered yet; continue polling briefly
          if (res.status !== 404) {
            throw new Error(`Failed to fetch job status (${res.status})`);
          }
          return;
        }
        const data = (await res.json()) as {
          status: JobStatus;
          videoUrl?: string;
          error?: string;
        };
        if (cancelled) return;

        if (data.status === "ready" && data.videoUrl) {
          setVideoUrl(data.videoUrl);
          setJobStatus("ready");
          clearInterval(interval);
        } else if (data.status === "error") {
          setJobStatus("error");
          setError(data.error ?? "Video generation failed");
          clearInterval(interval);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? "Failed to check job status");
          setJobStatus("error");
        }
      }
    };

    // Start polling
    poll();
    interval = setInterval(poll, 3000);

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
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
        className={"w-full rounded-lg border border-border bg-card text-card-foreground p-6 flex items-center justify-center"}
        style={{ aspectRatio: "16 / 9" }}
        aria-busy="true"
        aria-label="Video container generating"
      >
        <div className="mx-auto max-w-md text-center space-y-4">
          <h2 className="text-balance text-lg font-medium">Video generating. Please wait</h2>
          <p className="text-sm text-muted-foreground">This may take a moment.</p>

          {/* Loading bar (indeterminate) */}
          <div className="mt-4">
            <div
              className="h-2 w-full overflow-hidden rounded bg-muted"
              role="progressbar"
              aria-label="Generating video"
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="h-full w-1/3 rounded bg-primary animate-pulse" />
            </div>
          </div>

          {/* Screen reader live status */}
          <p className="sr-only" aria-live="polite" role="status">
            Video generating. Please wait
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full rounded-lg border border-border bg-card text-card-foreground p-2" style={{ aspectRatio: "16 / 9" }}>
      <video ref={videoRef} src={videoUrl} controls className="w-full h-full rounded-md" />
    </div>
  );
}

