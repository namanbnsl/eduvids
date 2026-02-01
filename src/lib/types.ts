import type { ToolUIPart, UIDataTypes, UIMessage } from "ai";

type GenerateVideoToolOutput = {
  jobId: string;
  description: string;
  status?: JobStatus;
  src?: string;
  videoUrl?: string;
  error?: string;
  details?: string;
  progress?: number;
  step?: string;
  variant?: "video" | "short";
};

type AppTools = {
  generate_video: {
    input: { description: string };
    output: GenerateVideoToolOutput;
  };
};

type ChatMessage = UIMessage<unknown, UIDataTypes, AppTools>;
type ChatMessagePart = ChatMessage["parts"][number];
type GenerateVideoToolUIPart = ToolUIPart<AppTools>;

type JobStatus = "generating" | "ready" | "error";
type YoutubeStatus = "pending" | "uploaded" | "failed";
type VideoVariant = "video" | "short";

type JobProgressEntry = {
  progress?: number;
  step?: string;
  details?: string;
  at: string;
};

type WebSource = {
  title: string;
  url: string;
  content: string;
  score: number;
};

type VideoJob = {
  id: string;
  description: string;
  status: JobStatus;
  variant: VideoVariant;
  videoUrl?: string;
  error?: string;
  // Progress fields (0-100)
  progress?: number;
  step?: string;
  details?: string;
  youtubeStatus?: YoutubeStatus;
  progressLog?: JobProgressEntry[];
  youtubeUrl?: string;
  youtubeVideoId?: string;
  youtubeError?: string;
  // Web sources from Tavily search
  sources?: WebSource[];
  createdAt: string;
  updatedAt: string;
};

// Interface for our job store
interface JobStore {
  create(
    description: string,
    options?: { variant?: VideoVariant; userId?: string }
  ): Promise<VideoJob>;
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
  setSources(id: string, sources: WebSource[]): Promise<VideoJob | undefined>;
}

type ValidationStage =
  | "input"
  | "heuristic"
  | "syntax"
  | "ast-guard"
  | "scene-validation"
  | "plugin-detection"
  | "plugin-installation"
  | "plugin-validation"
  | "layout-injection"
  | "latex"
  | "dry-run"
  | "render"
  | "video-validation"
  | "watermark"
  | "watermark-validation"
  | "download";

interface RenderLogEntry {
  timestamp: string;
  level: "info" | "warn" | "error" | "stdout" | "stderr";
  message: string;
  context?: string;
}

type RenderProcessError = Error & {
  stderr?: string;
  stdout?: string;
  exitCode?: number;
  stage?: ValidationStage;
  hint?: string;
  logs?: RenderLogEntry[];
};

type RenderAttemptSuccess = {
  uploadUrl: string;
  warnings: Array<{ stage: ValidationStage; message: string }>;
  logs: RenderLogEntry[];
};

type HeuristicSeverity = "noncode" | "fixable" | "critical";
type HeuristicIssue = { message: string; severity: HeuristicSeverity };
type HeuristicOptions = { allowVerificationFixes?: boolean };

export type {
  GenerateVideoToolOutput,
  AppTools,
  ChatMessage,
  ChatMessagePart,
  GenerateVideoToolUIPart,
  JobStatus,
  YoutubeStatus,
  VideoVariant,
  VideoJob,
  JobStore,
  ValidationStage,
  RenderLogEntry,
  RenderProcessError,
  RenderAttemptSuccess,
  HeuristicIssue,
  HeuristicOptions,
  HeuristicSeverity,
  JobProgressEntry,
  WebSource,
};
