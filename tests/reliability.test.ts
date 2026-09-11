import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Sandbox } from "@e2b/code-interpreter";
import { MockLanguageModelV3, simulateReadableStream } from "ai/test";
import {
  buildJobRunner,
  buildPostprocessScript,
  pollSandboxJob,
  renderCommand,
} from "../src/lib/workflow/sandbox-jobs";
import { streamTextWithTracking, sanitizeManimScript } from "../src/lib/llm";
import {
  safeError,
  generationFailureMessage,
} from "../src/lib/workflow/errors";
import type { PreparedSandboxState } from "../src/lib/e2b";

const exec = promisify(execFile);
const state = (folder: string): PreparedSandboxState => ({
  sandboxId: "fixture",
  scriptPath: `${folder}/script.py`,
  mediaDir: `${folder}/media`,
  baseVideosDir: `${folder}/media/videos`,
  sceneNames: ["First", "Second"],
  warnings: [],
  logs: [],
  applyWatermark: true,
});

test("duplicate sandbox launches execute the render once and preserve its exit code", async () => {
  const folder = await mkdtemp(join(tmpdir(), "workflow-runner-"));
  try {
    const prefix = join(folder, "render");
    const counter = join(folder, "counter");
    const runner = join(folder, "runner.py");
    await writeFile(
      runner,
      buildJobRunner(prefix, [
        "python3",
        "-c",
        `import time; open(${JSON.stringify(counter)}, 'a').write('x'); time.sleep(0.1); raise SystemExit(7)`,
      ]),
    );
    await Promise.all([exec("python3", [runner]), exec("python3", [runner])]);
    await exec("python3", [runner]); // Retried after completion, too.
    assert.equal(await readFile(counter, "utf8"), "x");
    assert.deepEqual(
      JSON.parse(await readFile(prefix + ".result.json", "utf8")),
      { exitCode: 7 },
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("polling never treats a missing result as success and enforces the job deadline", async () => {
  const connection = mock.method(
    Sandbox,
    "connect",
    async () =>
      ({
        commands: { run: async () => ({ stdout: '{"complete":false}' }) },
      }) as never,
  );
  try {
    assert.deepEqual(
      await pollSandboxJob({
        sandboxId: "test",
        prefix: "/tmp/test",
        startedAt: Date.now(),
      }),
      { complete: false },
    );
    const expired = await pollSandboxJob({
      sandboxId: "test",
      prefix: "/tmp/test",
      startedAt: Date.now() - 1_900_000,
    });
    assert.equal(expired.complete, true);
    assert.equal(expired.exitCode, -1);
  } finally {
    connection.mock.restore();
  }
});

test("postprocessing joins real scene fixtures, watermarks, and validates an MP4", async () => {
  const folder = await mkdtemp(join(tmpdir(), "workflow-video-"));
  try {
    const prepared = state(folder);
    const outputs = `${prepared.baseVideosDir}/script/720p30`;
    await mkdir(outputs, { recursive: true });
    for (const scene of prepared.sceneNames) {
      await exec("ffmpeg", [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=blue:s=160x90:d=0.2",
        "-f",
        "lavfi",
        "-i",
        "anullsrc",
        "-shortest",
        "-c:v",
        "libx264",
        "-c:a",
        "aac",
        `${outputs}/${scene}.mp4`,
      ]);
    }
    const script = join(folder, "process.py");
    await writeFile(script, buildPostprocessScript(prepared));
    await exec("python3", [script]);
    const probe = await exec("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      join(folder, "final.mp4"),
    ]);
    assert.ok(Number(probe.stdout) >= 0.4);
    await rm(`${outputs}/Second.mp4`);
    await assert.rejects(
      exec("python3", [script]),
      /Expected one complete rendered output/,
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("portrait render uses Manim width,height ordering", () => {
  const prepared = {
    ...state("/home/user"),
    renderOptions: { resolution: { width: 720, height: 1280 } },
  };
  assert.deepEqual(renderCommand(prepared).slice(-2), ["-r", "720,1280"]);
});

test("provider failures are redacted and do not retry inside an invocation", async () => {
  const model = new MockLanguageModelV3({
    doStream: async () => {
      throw new Error(
        "Permission denied: Consumer api_key:AIzaExampleSecret has been suspended.",
      );
    },
  });
  await assert.rejects(
    streamTextWithTracking({ model, prompt: "test" }),
    (error: Error) => {
      assert.match(error.message, /suspended/);
      assert.doesNotMatch(error.message, /AIzaExampleSecret/);
      return true;
    },
  );
  assert.equal(model.doStreamCalls.length, 1);
});

test("partial output followed by a stream error is rejected", async () => {
  const model = new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start", id: "t" },
          { type: "text-delta", id: "t", delta: "class Partial" },
          { type: "error", error: new Error("provider disconnected") },
        ],
      }),
    }),
  });
  await assert.rejects(
    streamTextWithTracking({ model, prompt: "test" }),
    /provider disconnected/,
  );
});

test("error messages distinguish credentials, deadlines, and script failures", () => {
  assert.match(
    generationFailureMessage("Permission denied; consumer suspended"),
    /credentials/,
  );
  assert.match(
    generationFailureMessage("FUNCTION_INVOCATION_TIMEOUT"),
    /time limit/,
  );
  assert.match(
    generationFailureMessage("ManimValidationError: no scene"),
    /automatic repair/,
  );
  assert.doesNotMatch(safeError("api_key:AIzaExampleSecret"), /AIza/);
});

test("sanitizing Python preserves comparisons and text containing angle brackets", () => {
  const script =
    'from manim import *\nclass Demo(Scene):\n    def construct(self):\n        x = Text("<hello>")\n        if 1 < x.width and x.width > 0:\n            self.add(x)';
  const sanitized = sanitizeManimScript(script);
  assert.ok(sanitized.includes('"<hello>"'));
  assert.ok(sanitized.includes("1 < x.width and x.width > 0"));
});

test("model cancellation aborts the provider request", async () => {
  const controller = new AbortController();
  const model = new MockLanguageModelV3({
    doStream: async ({ abortSignal }) => {
      assert.ok(abortSignal);
      return new Promise((_, reject) => {
        abortSignal.addEventListener(
          "abort",
          () => reject(abortSignal.reason),
          { once: true },
        );
        controller.abort(new Error("deadline exceeded"));
      });
    },
  });
  await assert.rejects(
    streamTextWithTracking({
      model,
      prompt: "test",
      abortSignal: controller.signal,
    }),
    /deadline|abort|No output/,
  );
  assert.equal(model.doStreamCalls.length, 1);
});
