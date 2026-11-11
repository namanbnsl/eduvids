import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, rm, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { videoGenerationPrompt } from "../src/lib/video-generation-policy";
import { MANIM_SYSTEM_PROMPT, VOICEOVER_SYSTEM_PROMPT } from "../src/prompt";
import { buildPostprocessScript } from "../src/lib/workflow/sandbox-jobs";
import type { PreparedSandboxState } from "../src/lib/e2b";
import {
  resolvePersistedYouTubeVideo,
  type UploadedYouTubeVideo,
} from "../src/lib/youtube";

const exec = promisify(execFile);

test("format policy preserves explicit duration requests without adding conflicting quotas", () => {
  const short = videoGenerationPrompt(
    "Explain the mechanism in 75 to 95 seconds.",
    "short",
  );
  assert.match(short, /75 to 95 seconds/);
  assert.match(short, /explicit duration.*takes precedence/);
  assert.match(short, /under 95 seconds/);
  assert.doesNotMatch(short, /under one minute|450-1000|90-140|4-8/);
  assert.match(
    videoGenerationPrompt("Explain briefly.", "video"),
    /two to four minutes/,
  );
  assert.match(short, /never pad/);
  assert.doesNotMatch(
    `${MANIM_SYSTEM_PROMPT}\n${VOICEOVER_SYSTEM_PROMPT}`,
    /6-14 normal|4-8 shorts|450-1000 words|90-140 words/,
  );
});

test("upload keeps the render's destination when concurrent runs change the inventory", () => {
  const rendered = {
    videoId: "selected123",
    title: "Why These Waves Separate",
    watchUrl: "https://www.youtube.com/watch?v=selected123",
  };
  const original: UploadedYouTubeVideo = {
    ...rendered,
    description: "",
    privacyStatus: "public",
  };
  const newlyPublished: UploadedYouTubeVideo = {
    ...original,
    videoId: "newer123456",
    title: "Why This Toy Returns Upright",
    watchUrl: "https://www.youtube.com/watch?v=newer123456",
  };
  assert.deepEqual(
    resolvePersistedYouTubeVideo(rendered, [newlyPublished, original]),
    rendered,
  );
  assert.deepEqual(
    resolvePersistedYouTubeVideo(rendered, [original]),
    rendered,
  );
  assert.equal(resolvePersistedYouTubeVideo(null, [newlyPublished]), undefined);
  assert.equal(
    resolvePersistedYouTubeVideo(undefined, [newlyPublished]),
    undefined,
  );
  assert.deepEqual(
    resolvePersistedYouTubeVideo(
      undefined,
      [newlyPublished, original],
      JSON.stringify(rendered),
    ),
    rendered,
  );
  assert.equal(
    resolvePersistedYouTubeVideo(null, [original], JSON.stringify(rendered)),
    undefined,
  );
  assert.equal(
    resolvePersistedYouTubeVideo(undefined, [original], "null"),
    undefined,
  );
  assert.throws(() =>
    resolvePersistedYouTubeVideo(undefined, [original], "invalid JSON"),
  );
  assert.throws(
    () => resolvePersistedYouTubeVideo(rendered, [newlyPublished]),
    /no longer available/,
  );
  assert.throws(
    () =>
      resolvePersistedYouTubeVideo(rendered, [
        { ...original, privacyStatus: "private" },
      ]),
    /no longer available/,
  );
});

test("postprocessing distinguishes silent visual scenes from missing or failed narration", async (t) => {
  const folder = await mkdtemp(join(tmpdir(), "eduvids-audio-validation-"));
  try {
    const outputs = join(folder, "media");
    await mkdir(outputs);
    const video = join(outputs, "Example.mp4");
    const prepared: PreparedSandboxState = {
      sandboxId: "fixture",
      scriptPath: join(folder, "script.py"),
      mediaDir: outputs,
      baseVideosDir: outputs,
      sceneNames: ["Example"],
      warnings: [],
      logs: [],
      applyWatermark: false,
    };
    const processScript = join(folder, "postprocess.py");
    await writeFile(processScript, buildPostprocessScript(prepared));
    const setSource = (narrated: boolean) =>
      writeFile(
        prepared.scriptPath,
        narrated
          ? 'class Narrated:\n    def construct(self):\n        with self.voiceover(text="Expected speech"):\n            pass\nclass Example(Narrated):\n    pass\n'
          : "class Example:\n    def construct(self):\n        pass\n",
      );
    const createFixture = async (audio?: string) => {
      await exec("ffmpeg", [
        "-v",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        "color=c=blue:s=160x90:d=0.3:r=30",
        ...(audio
          ? ["-f", "lavfi", "-i", audio, "-c:a", "aac", "-shortest"]
          : []),
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        video,
      ]);
    };
    await t.test(
      "declared visual-only scene without an audio stream remains valid",
      async () => {
        await setSource(false);
        await createFixture();
        await exec("python3", [processScript]);
      },
    );
    await t.test("inherited narration with no audio stream fails", async () => {
      await setSource(true);
      await assert.rejects(
        exec("python3", [processScript]),
        /Missing narration audio for Example/,
      );
    });
    await t.test(
      "an entirely silent audio stream cannot stand in for expected narration",
      async () => {
        await createFixture("anullsrc=r=48000:cl=stereo");
        await assert.rejects(
          exec("python3", [processScript]),
          /Empty narration audio for Example/,
        );
      },
    );
    await t.test(
      "partial PCM followed by decoder failure cannot be padded into success",
      async () => {
        await createFixture("sine=frequency=440:duration=0.3");
        const bin = join(folder, "bin");
        await mkdir(bin);
        const realFfmpeg = (await exec("which", ["ffmpeg"])).stdout.trim();
        await writeFile(
          join(bin, "ffmpeg"),
          `#!/usr/bin/env python3\nimport os, sys\nif '-vn' in sys.argv:\n    sys.stdout.buffer.write(bytes([1]) * 100)\n    raise SystemExit(7)\nos.execv(${JSON.stringify(realFfmpeg)}, [${JSON.stringify(realFfmpeg)}, *sys.argv[1:]])\n`,
        );
        await chmod(join(bin, "ffmpeg"), 0o755);
        await assert.rejects(
          exec("python3", [processScript], {
            env: { ...process.env, PATH: `${bin}:${process.env.PATH}` },
          }),
          /Could not decode scene audio for Example/,
        );
      },
    );
    await t.test(
      "valid narrated media still processes successfully",
      async () => {
        await exec("python3", [processScript]);
      },
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
