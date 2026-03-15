import { jobStore } from "@/lib/job-store";

export type JobProgressUpdate = {
  progress?: number;
  step?: string;
  details?: string;
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
