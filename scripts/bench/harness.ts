/**
 * Local end-to-end render benchmark: runs the repository's real prepare,
 * render-job and postprocess code against a stand-in for the E2B sandbox that
 * executes commands on this machine. See scripts/bench/README.md.
 *
 *   npx tsx scripts/bench/harness.ts <script.py> <out.json>
 */
import { mock } from "node:test";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { CommandExitError, Sandbox } from "@e2b/code-interpreter";

const HOME = "/home/user";
const sandboxEnv: Record<string, string> = {};
const timeline: Record<string, number> = {};

type RunOptions = {
  envs?: Record<string, string>;
  background?: boolean;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
};

function run(command: string, opts: RunOptions = {}) {
  return new Promise<unknown>((resolve, reject) => {
    const child = spawn("bash", ["-c", command], {
      cwd: HOME,
      env: { ...process.env, ...sandboxEnv, ...(opts.envs ?? {}) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => {
      stdout += d;
      opts.onStdout?.(String(d));
    });
    child.stderr.on("data", (d) => {
      stderr += d;
      opts.onStderr?.(String(d));
    });
    if (opts.background) {
      resolve({ disconnect: async () => undefined, pid: child.pid });
      return;
    }
    child.on("close", (exitCode) => {
      const result = { stdout, stderr, exitCode: exitCode ?? 1, error: stderr };
      if (exitCode === 0) resolve(result);
      else reject(new CommandExitError(result as never));
    });
  });
}

const fake = {
  sandboxId: "local",
  files: {
    write: async (path: string, data: string | ArrayBuffer) => {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(
        path,
        typeof data === "string" ? data : Buffer.from(data),
      );
    },
    read: async (path: string, opts?: { format?: string }) => {
      const bytes = await readFile(path);
      return opts?.format === "bytes"
        ? new Uint8Array(bytes)
        : bytes.toString("utf8");
    },
  },
  commands: { run },
  kill: async () => undefined,
};

mock.method(Sandbox, "create", async (_template: string, opts?: RunOptions) => {
  Object.assign(sandboxEnv, opts?.envs ?? {});
  return fake;
});
mock.method(Sandbox, "connect", async () => fake);
mock.method(Sandbox, "kill", async () => true);

async function main() {
  const [scriptPath, outPath] = process.argv.slice(2);
  const repo = process.cwd();
  const e2b = await import(`${repo}/src/lib/e2b.ts`);
  const jobs = await import(`${repo}/src/lib/workflow/sandbox-jobs.ts`);
  const tts = await import(`${repo}/src/lib/eduvids-tts-service.ts`);
  const { videoPalette } = await import(`${repo}/src/lib/video-style.ts`);

  for (const entry of [
    "script.py",
    "media",
    "final.mp4",
    "combined.mp4",
    "soundtrack.pcm",
    "scenes.txt",
    "scene_durations.json",
  ]) {
    await rm(`${HOME}/${entry}`, { recursive: true, force: true });
  }
  execFileSync("bash", ["-c", `rm -f ${HOME}/*-job*.* ${HOME}/postprocess.py`]);

  const script = await readFile(scriptPath, "utf8");
  const t0 = Date.now();
  const prepared = await e2b.prepareManimSandbox({
    script,
    prompt: "derivatives",
    sessionId: "bench",
    variant: "video",
    palette: videoPalette("bench-job"),
    applyWatermark: true,
    skipDryRun: true,
  });
  timeline.prepare = (Date.now() - t0) / 1000;

  // Emulate a smaller sandbox's free memory (MemAvailable) for the driver.
  if (process.env.BENCH_MEM_MB) {
    const driverPath = `${HOME}/eduvids_render.py`;
    const driver = await readFile(driverPath, "utf8");
    await writeFile(
      driverPath,
      driver.replace(
        "def available_mb():\n",
        "def available_mb():\n    return int(os.environ['BENCH_MEM_MB'])\n",
      ),
    );
  }

  // Narration: deterministic tone clips stand in for the TTS provider, named
  // exactly as the adapter looks them up, so the render path is unchanged.
  const narration = join(repo, "scripts/bench/narration.py");
  execFileSync(
    "python",
    [narration, `${HOME}/script.py`, `${prepared.mediaDir}/audio-prefetch`],
    {
      stdio: "inherit",
      env: { ...process.env, ...sandboxEnv },
    },
  );

  const waitJob = async (
    job: Awaited<ReturnType<typeof jobs.startSandboxJob>>,
  ) => {
    while (true) {
      const status = await jobs.pollSandboxJob(job);
      if (status.complete) return status;
      await new Promise((r) => setTimeout(r, 200));
    }
  };

  const t1 = Date.now();
  // Older revisions launched the postprocess as a second job.
  const job = jobs.startRenderJob
    ? await jobs.startRenderJob(
        prepared,
        "render-job-bench",
        tts.eduvidsTTSSandboxEnvironment(),
      )
    : await jobs.startSandboxJob(
        prepared.sandboxId,
        "render-job-bench",
        jobs.renderJobCommand(prepared),
        tts.eduvidsTTSSandboxEnvironment(),
      );
  const rendered = await waitJob(job);
  timeline.render = (Date.now() - t1) / 1000;
  if (rendered.exitCode !== 0)
    throw new Error(`render failed: ${rendered.error}`);

  // The postprocess may be chained into the render job (no separate step).
  if (existsSync(`${HOME}/final.mp4`)) {
    timeline.postprocess = 0;
  } else {
    const t2 = Date.now();
    const processing = await jobs.startPostprocess(prepared);
    const processed = await waitJob(processing);
    timeline.postprocess = (Date.now() - t2) / 1000;
    if (processed.exitCode !== 0)
      throw new Error(`postprocess failed: ${processed.error}`);
  }

  const t3 = Date.now();
  const video = await jobs.downloadVideo(prepared.sandboxId);
  timeline.download = (Date.now() - t3) / 1000;
  timeline.total = (Date.now() - t0) / 1000;

  const probe = execFileSync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration,size,bit_rate",
    "-of",
    "json",
    `${HOME}/final.mp4`,
  ]).toString();
  const log = execFileSync("bash", [
    "-c",
    `grep -h eduvids-render ${HOME}/render-job-bench.log || true`,
  ]).toString();
  const result = {
    timeline,
    probe: JSON.parse(probe).format,
    videoBytes: video.length,
    driverLog: log.trim().split("\n"),
  };
  await writeFile(outPath, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
