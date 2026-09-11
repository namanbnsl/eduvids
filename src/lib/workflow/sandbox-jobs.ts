import { Sandbox } from "@e2b/code-interpreter";
import type { PreparedSandboxState } from "@/lib/e2b";

export const SANDBOX_JOB_TIMEOUT_SECONDS = 1_800;
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
): Promise<SandboxJob> {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error("Invalid sandbox job name");
  const sandbox = await connectSandbox(sandboxId);
  const prefix = `/home/user/${name}`;
  await sandbox.files.write(`${prefix}.py`, buildJobRunner(prefix, command));
  const handle = await sandbox.commands.run(`python ${prefix}.py`, {
    background: true,
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

export function renderCommand(prepared: PreparedSandboxState): string[] {
  const args = [
    "manim",
    prepared.scriptPath,
    ...prepared.sceneNames,
    "--media_dir",
    prepared.mediaDir,
    "--disable_caching",
    "--format=mp4",
    "-qm",
  ];
  const resolution = prepared.renderOptions?.resolution;
  if (resolution)
    args.push(
      "-r",
      `${Math.round(resolution.width)},${Math.round(resolution.height)}`,
    );
  return args;
}

// Runs entirely in E2B; neither ffmpeg nor its retries occupy a Vercel request.
export function buildPostprocessScript(prepared: PreparedSandboxState): string {
  return `import json, pathlib, subprocess, math
settings = json.loads(${JSON.stringify(JSON.stringify({ base: prepared.baseVideosDir, workdir: prepared.scriptPath.slice(0, prepared.scriptPath.lastIndexOf("/")), scenes: prepared.sceneNames, watermark: prepared.applyWatermark, variant: prepared.variant }))})
base = pathlib.Path(settings['base']) / 'script'
workdir = pathlib.Path(settings['workdir'])
paths = []
for scene in settings['scenes']:
    candidates = sorted(p for p in base.rglob(scene + '.mp4') if 'partial_movie_files' not in p.parts)
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
for path in paths:
    duration(path)
source = paths[0]
if len(paths) > 1:
    listing = workdir / 'scenes.txt'
    listing.write_text(''.join("file '" + str(p) + "'\\n" for p in paths))
    source = workdir / 'combined.mp4'
    run(['ffmpeg', '-y', '-f', 'concat', '-safe', '0', '-i', str(listing), '-c', 'copy', str(source)])
output = workdir / 'final.mp4'
args = ['ffmpeg', '-y', '-i', str(source)]
if settings['watermark']:
    args += ['-vf', "drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf:text='eduvids':fontcolor=white:fontsize=24:x=w-tw-20:y=h-th-20", '-c:v', 'libx264', '-preset', 'fast', '-pix_fmt', 'yuv420p']
else:
    args += ['-c:v', 'copy']
args += ['-c:a', 'copy', '-movflags', '+faststart', str(output)]
run(args)
duration(output)
`;
}

export async function startPostprocess(
  prepared: PreparedSandboxState,
): Promise<SandboxJob> {
  const sandbox = await connectSandbox(prepared.sandboxId);
  await sandbox.files.write(
    "/home/user/postprocess.py",
    buildPostprocessScript(prepared),
  );
  return startSandboxJob(prepared.sandboxId, "postprocess-job", [
    "python",
    "/home/user/postprocess.py",
  ]);
}

export async function downloadVideo(sandboxId: string): Promise<string> {
  const sandbox = await connectSandbox(sandboxId);
  const bytes = await sandbox.files.read("/home/user/final.mp4", {
    format: "bytes",
    requestTimeoutMs: 45_000,
  });
  if (!bytes.length) throw new Error("Rendered video is empty");
  return `data:video/mp4;base64,${Buffer.from(bytes).toString("base64")}`;
}

export async function cleanupSandbox(sandboxId: string): Promise<void> {
  await Sandbox.kill(sandboxId, { requestTimeoutMs: REQUEST_TIMEOUT_MS });
}
