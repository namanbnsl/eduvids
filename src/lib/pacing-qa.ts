/**
 * Pacing check on a finished video, before it goes to YouTube.
 *
 * Shorts lost most viewers 8 to 20 seconds in, and the frame-by-frame review
 * found why: 70 to 84% of their first 30 seconds was one still frame with the
 * narration running over it, and scenes were separated by about 2 s of
 * silence and a fade to black (healthy Shorts were 17 to 38% frozen). The
 * render job measures the final cut with ffmpeg (see PACING_QA_FILTERS) and
 * this decides whether it is fit to publish.
 */

/** ffmpeg filters the render job runs over the final video. */
export const PACING_QA_FILTERS = {
  // A frame counts as frozen while it differs from the last changed frame by
  // at most 0.05% (mean absolute difference over all planes); runs of 2 s or
  // more are reported. Measured on the bench video: at 0.2%, the level used
  // on YouTube downloads (whose compression adds noise), a dot and tangent
  // line sweeping across a graph still read as frozen, because thin strokes on
  // black change few pixels. Our own encode of a held frame is noise-free, so
  // 0.05% catches every real hold and none of that motion.
  video: "freezedetect=n=0.0005:d=2",
  // Silence is quieter than -40 dB; runs of 0.8 s or more are reported.
  audio: "silencedetect=noise=-40dB:d=0.8",
} as const;

export const PACING_LIMITS = {
  /** The opening window where viewers decide to stay. */
  openingSeconds: 30,
  /** Most of that window that may be frozen. */
  maxFrozenShareOfOpening: 0.3,
  /** Longest single freeze anywhere. */
  maxFreezeSeconds: 3,
  /** Longest silence anywhere (between lines or scenes). */
  maxSilenceSeconds: 1,
} as const;

export type Interval = [start: number, end: number];

export interface PacingReport {
  /** Length of the final video, in seconds. */
  duration: number;
  freezes: Interval[];
  silences: Interval[];
}

export interface PacingVerdict {
  ok: boolean;
  frozenShareOfOpening: number;
  longestFreeze: number;
  longestSilence: number;
  problems: string[];
}

const seconds = (value: number) => `${value.toFixed(1)} s`;

function clamp(intervals: Interval[], duration: number): Interval[] {
  return intervals
    .map(
      ([start, end]) =>
        [Math.max(0, start), Math.min(duration, end)] as Interval,
    )
    .filter(([start, end]) => end > start);
}

export function evaluatePacing(
  report: PacingReport,
  limits: typeof PACING_LIMITS = PACING_LIMITS,
): PacingVerdict {
  const duration = report.duration;
  const freezes = clamp(report.freezes, duration);
  // The audio track can stop a moment before the picture does; quiet that
  // runs into the very end of the video is the ending, not a gap.
  const silences = clamp(report.silences, duration).filter(
    ([, end]) => end < duration - 0.05,
  );

  const opening = Math.min(limits.openingSeconds, duration);
  const frozenInOpening = freezes.reduce(
    (total, [start, end]) =>
      total + Math.max(0, Math.min(end, opening) - start),
    0,
  );
  const frozenShareOfOpening = opening > 0 ? frozenInOpening / opening : 0;
  const longest = (intervals: Interval[]) =>
    intervals.reduce(
      (best, [start, end]) =>
        end - start > best[1] - best[0] ? [start, end] : best,
      [0, 0] as Interval,
    );
  const [freezeStart, freezeEnd] = longest(freezes);
  const [silenceStart, silenceEnd] = longest(silences);
  const longestFreeze = freezeEnd - freezeStart;
  const longestSilence = silenceEnd - silenceStart;

  const problems: string[] = [];
  if (frozenShareOfOpening > limits.maxFrozenShareOfOpening)
    problems.push(
      `${Math.round(frozenShareOfOpening * 100)}% of the first ${Math.round(opening)} s is a frozen frame (limit ${Math.round(limits.maxFrozenShareOfOpening * 100)}%)`,
    );
  if (longestFreeze > limits.maxFreezeSeconds)
    problems.push(
      `frozen frame for ${seconds(longestFreeze)} from ${seconds(freezeStart)} (limit ${seconds(limits.maxFreezeSeconds)})`,
    );
  if (longestSilence > limits.maxSilenceSeconds)
    problems.push(
      `silence for ${seconds(longestSilence)} from ${seconds(silenceStart)} (limit ${seconds(limits.maxSilenceSeconds)})`,
    );

  return {
    ok: problems.length === 0,
    frozenShareOfOpening,
    longestFreeze,
    longestSilence,
    problems,
  };
}

const isInterval = (value: unknown): value is Interval =>
  Array.isArray(value) &&
  value.length === 2 &&
  value.every((part) => typeof part === "number" && Number.isFinite(part));

/** The render job's JSON, or null when it is missing or malformed. */
export function parsePacingReport(text: string): PacingReport | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const { duration, freezes, silences } = value as Record<string, unknown>;
  if (
    typeof duration !== "number" ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    !Array.isArray(freezes) ||
    !Array.isArray(silences) ||
    !freezes.every(isInterval) ||
    !silences.every(isInterval)
  )
    return null;
  return { duration, freezes, silences };
}

/**
 * "block" (default) keeps a video that fails the check off YouTube; "warn"
 * only logs it; "off" skips it.
 */
export function pacingQaMode(
  value = process.env.PACING_QA,
): "block" | "warn" | "off" {
  const mode = value?.trim().toLowerCase();
  return mode === "warn" || mode === "off" ? mode : "block";
}
