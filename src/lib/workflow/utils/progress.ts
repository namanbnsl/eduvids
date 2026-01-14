import { jobStore } from "@/lib/job-store";
import type { RenderLifecycleStage } from "@/lib/e2b";

export type JobProgressUpdate = {
  progress?: number;
  step?: string;
  details?: string;
};

const RENDER_STAGE_PROGRESS: Partial<
  Record<RenderLifecycleStage, { progress: number; step: string }>
> = {
  sandbox: { progress: 46, step: "Preparing environment" },
  "layout-injection": { progress: 48, step: "Setting up" },
  prepare: { progress: 50, step: "Uploading" },
  syntax: { progress: 52, step: "Checking" },
  "ast-guard": { progress: 54, step: "Validating" },
  "scene-validation": { progress: 56, step: "Validating" },
  "plugin-installation": { progress: 58, step: "Installing" },
  latex: { progress: 60, step: "Preparing LaTeX" },
  render: { progress: 66, step: "Rendering" },
  "render-output": { progress: 70, step: "Done rendering" },
  files: { progress: 72, step: "Processing" },
  "video-validation": { progress: 75, step: "Checking video" },
  "video-processing": { progress: 78, step: "Processing" },
  watermark: { progress: 82, step: "Adding watermark" },
  "watermark-validation": { progress: 84, step: "Finalizing" },
};

const formatStepLabel = (value: string): string =>
  value
    .split(/[-_\s]+/)
    .map((word) =>
      word.length > 0 ? `${word[0]?.toUpperCase() ?? ""}${word.slice(1)}` : ""
    )
    .join(" ");

export const stageToJobUpdate = (stage: RenderLifecycleStage) =>
  RENDER_STAGE_PROGRESS[stage] ?? {
    progress: 60,
    step: formatStepLabel(stage),
  };

export const updateJobProgress = async (
  jobId: string | undefined,
  update: JobProgressUpdate
) => {
  if (!jobId) return;
  try {
    await jobStore.setProgress(jobId, update);
  } catch (error) {
    console.warn("Failed to update job progress", { jobId, update, error });
  }
};

export const formatJobError = (
  error: unknown
): {
  message: string;
  detail?: string;
} => {
  const fallbackMessage =
    "Something went wrong while generating your video. Please try again or contact support.";
  let message = fallbackMessage;
  let detail: string | undefined = undefined;
  if (error && typeof error === "object") {
    if (
      error instanceof Error &&
      typeof error.message === "string" &&
      error.message.length < 160
    ) {
      message = error.message;
    } else if (
      "message" in error &&
      typeof (error as { message?: unknown }).message === "string" &&
      (error as { message: string }).message.length < 160
    ) {
      message = (error as { message: string }).message;
    }
    const hint =
      "hint" in error ? (error as { hint?: unknown }).hint : undefined;
    const exitCode =
      "exitCode" in error
        ? (error as { exitCode?: unknown }).exitCode
        : undefined;
    if (hint && typeof hint === "string" && hint.length < 160) {
      detail = hint;
    } else if (typeof exitCode === "number") {
      detail = `Exited with code ${exitCode}`;
    }
  } else if (typeof error === "string" && error.length < 160) {
    message = error;
  }
  return { message, detail };
};
