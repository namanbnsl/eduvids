import { Sandbox } from "@e2b/code-interpreter";
import type { PreparedSandboxState } from "@/lib/e2b";
import {
  RENDER_DRIVER_PATH,
  videoRenderFlags,
  WATERMARK_FONT_PYTHON,
  WATERMARK_STYLE,
} from "@/lib/video-style";

export const SANDBOX_JOB_TIMEOUT_SECONDS = 1_800;
export const SANDBOX_POLL_WINDOW_MS = 150_000;
export const MAX_SANDBOX_POLL_WINDOWS = 12;
const REQUEST_TIMEOUT_MS = 15_000;

export type SandboxJob = {
  sandboxId: string;
  prefix: string;
  startedAt: number;
};
export type SandboxJobResult = {
  complete: boolean;
  exitCode?: number;
  error?: string;
};

// The lock and atomic result file make delivery retries safe, including a lost
// launch response. A disappeared process without a result is never success.
export function buildJobRunner(prefix: string, command: string[]): string {
  return `import fcntl, json, os, subprocess, time
prefix = ${JSON.stringify(prefix)}
command = json.loads(${JSON.stringify(JSON.stringify(command))})
lock = open(prefix + '.lock', 'w')
try:
    fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
except BlockingIOError:
    raise SystemExit(0)
if os.path.exists(prefix + '.result.json'):
    raise SystemExit(0)
code = 1
with open(prefix + '.log', 'w') as log:
    try:
        result = subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, timeout=${SANDBOX_JOB_TIMEOUT_SECONDS})
        code = result.returncode
    except Exception as error:
        log.write(str(error))
with open(prefix + '.result.tmp', 'w') as result:
    json.dump({'exitCode': code}, result)
os.replace(prefix + '.result.tmp', prefix + '.result.json')
`;
}

export async function connectSandbox(sandboxId: string) {
  return Sandbox.connect(sandboxId, { requestTimeoutMs: REQUEST_TIMEOUT_MS });
}

export async function startSandboxJob(
  sandboxId: string,
  name: string,
  command: string[],
  envs?: Record<string, string>,
): Promise<SandboxJob> {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error("Invalid sandbox job name");
  const sandbox = await connectSandbox(sandboxId);
  const prefix = `/home/user/${name}`;
  await sandbox.files.write(`${prefix}.py`, buildJobRunner(prefix, command));
  const handle = await sandbox.commands.run(`python ${prefix}.py`, {
    background: true,
    envs,
    timeoutMs: (SANDBOX_JOB_TIMEOUT_SECONDS + 30) * 1000,
    requestTimeoutMs: REQUEST_TIMEOUT_MS,
  });
  await handle.disconnect();
  return { sandboxId, prefix, startedAt: Date.now() };
}

export async function pollSandboxJob(
  job: SandboxJob,
): Promise<SandboxJobResult> {
  const sandbox = await connectSandbox(job.sandboxId);
  const result = await sandbox.commands.run(
    `python - <<'PY'
import json, os
prefix = ${JSON.stringify(job.prefix)}
if os.path.exists(prefix + '.result.json'):
    with open(prefix + '.result.json') as f:
        result = json.load(f)
    result['complete'] = True
    if result['exitCode'] != 0:
        with open(prefix + '.log', 'rb') as f:
            f.seek(0, 2)
            f.seek(max(0, f.tell() - 6000))
            result['error'] = f.read().decode('utf-8', errors='replace')
    print(json.dumps(result))
else:
    print('{"complete":false}')
PY`,
    { timeoutMs: 10_000, requestTimeoutMs: REQUEST_TIMEOUT_MS },
  );
  const status = JSON.parse(result.stdout) as SandboxJobResult;
  if (
    !status.complete &&
    Date.now() - job.startedAt > (SANDBOX_JOB_TIMEOUT_SECONDS + 60) * 1000
  ) {
    return {
      complete: true,
      exitCode: -1,
      error: "Sandbox job timed out without a completion record",
    };
  }
  return status;
}

type PollWindowOptions = {
  windowMs?: number;
  intervalMs?: number;
  now?: () => number;
  delay?: (milliseconds: number) => Promise<void>;
  poll?: (job: SandboxJob) => Promise<SandboxJobResult>;
};

/**
 * Poll several times inside one bounded workflow invocation. This keeps E2B
 * rendering durable without spending one Upstash step on every poll and sleep.
 */
export async function pollSandboxJobWindow(
  job: SandboxJob,
  options: PollWindowOptions = {},
): Promise<SandboxJobResult> {
  const windowMs = options.windowMs ?? SANDBOX_POLL_WINDOW_MS;
  // A poll is one small command; checking often keeps a finished job from
  // idling for most of an interval before the workflow moves on.
  const intervalMs = options.intervalMs ?? 2_000;
  const now = options.now ?? Date.now;
  const delay =
    options.delay ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  const poll = options.poll ?? pollSandboxJob;
  const deadline = now() + windowMs;

  while (true) {
    const result = await poll(job);
    if (result.complete) return result;

    const remaining = deadline - now();
    if (remaining <= 0) return result;
    await delay(Math.min(intervalMs, remaining));
  }
}

function manimFlags(prepared: PreparedSandboxState): string[] {
  return videoRenderFlags(prepared.renderOptions?.resolution);
}

export function renderCommand(prepared: PreparedSandboxState): string[] {
  return [
    "manim",
    prepared.scriptPath,
    ...prepared.sceneNames,
    "--media_dir",
    prepared.mediaDir,
    ...manimFlags(prepared),
  ];
}

export const POSTPROCESS_PATH = "/home/user/postprocess.py";
export const FINAL_VIDEO_PATH = "/home/user/final.mp4";
/** Render-job exit code when scenes rendered but the postprocess failed. */
export const POSTPROCESS_FAILED_EXIT = 86;

/**
 * The render job: prefetches narration audio and formulas in parallel, renders
 * scenes across parallel Manim processes (see render_driver.py), then runs the
 * postprocess in the same job, so the finished video needs no second launch
 * and poll.
 */
export function renderJobCommand(prepared: PreparedSandboxState): string[] {
  return [
    "python",
    RENDER_DRIVER_PATH,
    JSON.stringify({
      script: prepared.scriptPath,
      scenes: prepared.sceneNames,
      media_dir: prepared.mediaDir,
      manim_args: manimFlags(prepared),
      postprocess: POSTPROCESS_PATH,
    }),
  ];
}

/** Writes the postprocess script the render job runs, then launches the job. */
export async function startRenderJob(
  prepared: PreparedSandboxState,
  name: string,
  envs?: Record<string, string>,
): Promise<SandboxJob> {
  const sandbox = await connectSandbox(prepared.sandboxId);
  await sandbox.files.write(POSTPROCESS_PATH, buildPostprocessScript(prepared));
  return startSandboxJob(
    prepared.sandboxId,
    name,
    renderJobCommand(prepared),
    envs,
  );
}

// Written next to the script by postprocessing (the workdir is /home/user).
export const SCENE_DURATIONS_PATH = "/home/user/scene_durations.json";

// Runs entirely in E2B; neither ffmpeg nor its retries occupy a Vercel request.
export function buildPostprocessScript(prepared: PreparedSandboxState): string {
  return `import concurrent.futures, json, pathlib, subprocess, math
${WATERMARK_FONT_PYTHON}
settings = json.loads(${JSON.stringify(JSON.stringify({ media: prepared.mediaDir, workdir: prepared.scriptPath.slice(0, prepared.scriptPath.lastIndexOf("/")), scenes: prepared.sceneNames, watermark: prepared.applyWatermark && !prepared.watermarkInVideo, variant: prepared.variant }))})
# Scenes may come from several parallel render processes' media directories.
media = pathlib.Path(settings['media'])
workdir = pathlib.Path(settings['workdir'])
paths = []
for scene in settings['scenes']:
    candidates = sorted(p for p in media.rglob(scene + '.mp4') if 'partial_movie_files' not in p.parts)
    if len(candidates) != 1:
        raise RuntimeError('Expected one complete rendered output for ' + scene)
    paths.append(candidates[0])
if not paths:
    raise RuntimeError('No rendered scenes')
def run(args):
    return subprocess.check_output(args, stderr=subprocess.STDOUT, timeout=900).decode().strip()
def duration(path):
    value = float(run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', str(path)]))
    if not math.isfinite(value) or value <= 0:
        raise RuntimeError('Invalid video duration')
    return value
# Each scene's audio track ends where its narration ends, while its video runs
# on through the closing fade. Stream-copy concatenation butts those audio
# tracks together and drops the gaps, so narration drifts ahead of the picture
# scene by scene. Build the soundtrack sample-accurately instead: each scene's
# audio padded or trimmed to exactly its video length, then muxed once.
RATE, CHANNELS, WIDTH = 48000, 2, 2
def video_duration(path):
    value = float(run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=duration', '-of', 'default=noprint_wrappers=1:nokey=1', str(path)]) or 'nan')
    if not math.isfinite(value) or value <= 0:
        value = duration(path)
    return value
def scene_audio(path):
    seconds = video_duration(path)
    pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-vn', '-ac', str(CHANNELS), '-ar', str(RATE), '-f', 's16le', '-'], stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=900).stdout
    size = round(seconds * RATE) * CHANNELS * WIDTH
    return seconds, pcm[:size] + bytes(max(0, size - len(pcm)))
# Scenes are probed and decoded in parallel (each is its own ffmpeg process),
# then written in order.
soundtrack = workdir / 'soundtrack.pcm'
timings = []
with concurrent.futures.ThreadPoolExecutor(min(8, len(paths))) as pool, open(soundtrack, 'wb') as out:
    for scene, (seconds, pcm) in zip(settings['scenes'], pool.map(scene_audio, paths)):
        timings.append({'scene': scene, 'seconds': seconds})
        out.write(pcm)
# Scene lengths, matching the final cut, become the YouTube chapters.
(workdir / 'scene_durations.json').write_text(json.dumps(timings))
video = paths[0]
if len(paths) > 1:
    listing = workdir / 'scenes.txt'
    listing.write_text(''.join("file '" + str(p) + "'\\n" for p in paths))
    video = workdir / 'combined.mp4'
    run(['ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', str(listing), '-an', '-c', 'copy', str(video)])
output = workdir / 'final.mp4'
args = ['ffmpeg', '-y', '-i', str(video), '-f', 's16le', '-ar', str(RATE), '-ac', str(CHANNELS), '-i', str(soundtrack), '-map', '0:v:0', '-map', '1:a:0']
if settings['watermark']:
    args += ['-vf', "drawtext=fontfile=" + watermark_font + ":text='eduvids':${WATERMARK_STYLE}", '-c:v', 'libx264', '-crf', '18', '-preset', 'fast', '-pix_fmt', 'yuv420p']
else:
    args += ['-c:v', 'copy']
args += ['-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', str(output)]
run(args)
duration(output)
`;
}

export async function downloadVideo(sandboxId: string): Promise<string> {
  const sandbox = await connectSandbox(sandboxId);
  const bytes = await sandbox.files.read(FINAL_VIDEO_PATH, {
    format: "bytes",
    requestTimeoutMs: 45_000,
  });
  if (!bytes.length) throw new Error("Rendered video is empty");
  return `data:video/mp4;base64,${Buffer.from(bytes).toString("base64")}`;
}

export async function cleanupSandbox(sandboxId: string): Promise<void> {
  await Sandbox.kill(sandboxId, { requestTimeoutMs: REQUEST_TIMEOUT_MS });
}

export type SceneDuration = { scene: string; seconds: number };

export async function readSceneDurations(
  sandboxId: string,
): Promise<SceneDuration[]> {
  const sandbox = await connectSandbox(sandboxId);
  const parsed = JSON.parse(
    await sandbox.files.read(SCENE_DURATIONS_PATH),
  ) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (entry): entry is SceneDuration =>
      typeof entry?.scene === "string" &&
      typeof entry?.seconds === "number" &&
      Number.isFinite(entry.seconds) &&
      entry.seconds > 0,
  );
}
