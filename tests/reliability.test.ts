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
  pollSandboxJobWindow,
  renderCommand,
  renderJobCommand,
} from "../src/lib/workflow/sandbox-jobs";
import {
  alignVoiceoverDurations,
  configureVoiceoverServicePrompt,
  enforceVoiceoverService,
  fixManimScript,
  manimVoiceoverTimingIssues,
  normalizeScenePlanTiming,
  scenePlanVisualGaps,
  streamTextWithTracking,
  sanitizeManimScript,
} from "../src/lib/llm";
import {
  injectEduvidsCallout,
  renderThumbnailCandidates,
} from "../src/lib/e2b";
import {
  applyVideoStyle,
  loadVideoStyleAssets,
  VIDEO_STYLE_MARKER,
  videoPalette,
  videoRenderFlags,
} from "../src/lib/video-style";
import {
  MANIM_SYSTEM_PROMPT,
  SCENE_PLAN_SYSTEM_PROMPT,
  VOICEOVER_SYSTEM_PROMPT,
  VOICEOVER_SERVICE_IMPORT_TOKEN,
  VOICEOVER_SERVICE_SETTER_TOKEN,
} from "../src/prompt";
import {
  buildThumbnailSpecs,
  THUMBNAIL_PALETTES,
  inferVisualType,
} from "../src/lib/youtube-thumbnail";
import {
  safeError,
  generationFailureMessage,
} from "../src/lib/workflow/errors";
import type { PreparedSandboxState } from "../src/lib/e2b";
import type { ScenePlanEntry } from "../src/lib/llm";
import { uploadThingFetch } from "../src/lib/uploadthing";
import { EDUVIDS_TTS_SERVICE_SOURCE } from "../src/lib/eduvids-tts-service";

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

test("a polling window batches repeated E2B checks into one workflow step", async () => {
  let clock = 0;
  let polls = 0;
  const result = await pollSandboxJobWindow(
    {
      sandboxId: "test",
      prefix: "/tmp/test",
      startedAt: Date.now(),
    },
    {
      windowMs: 30,
      intervalMs: 10,
      now: () => clock,
      delay: async (milliseconds) => {
        clock += milliseconds;
      },
      poll: async () => {
        polls += 1;
        return { complete: polls === 3, exitCode: polls === 3 ? 0 : undefined };
      },
    },
  );
  assert.deepEqual(result, { complete: true, exitCode: 0 });
  assert.equal(polls, 3);
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
    // Per-scene lengths are recorded for YouTube chapters, in scene order.
    const timings = JSON.parse(
      await readFile(join(folder, "scene_durations.json"), "utf8"),
    ) as { scene: string; seconds: number }[];
    assert.deepEqual(
      timings.map(({ scene }) => scene),
      prepared.sceneNames,
    );
    assert.ok(timings.every(({ seconds }) => seconds > 0.1));
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

test("nonempty output with an uncategorized finish reason remains usable", async () => {
  const model = new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start", id: "t" },
          { type: "text-delta", id: "t", delta: "class Complete(Scene): pass" },
          { type: "text-end", id: "t" },
          {
            type: "finish",
            finishReason: { unified: "other", raw: "OTHER" },
            logprobs: undefined,
            usage: {
              inputTokens: {
                total: 1,
                noCache: 1,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: { total: 5, text: 5, reasoning: undefined },
            },
          },
        ],
      }),
    }),
  });
  assert.equal(
    await streamTextWithTracking({ model, prompt: "test" }),
    "class Complete(Scene): pass",
  );
});

test("length-limited output reports diagnostic metadata", async () => {
  const model = new MockLanguageModelV3({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start", id: "t" },
          { type: "text-delta", id: "t", delta: "class Partial" },
          { type: "text-end", id: "t" },
          {
            type: "finish",
            finishReason: { unified: "length", raw: "MAX_TOKENS" },
            logprobs: undefined,
            usage: {
              inputTokens: {
                total: 1,
                noCache: 1,
                cacheRead: undefined,
                cacheWrite: undefined,
              },
              outputTokens: { total: 2, text: 2, reasoning: undefined },
            },
          },
        ],
      }),
    }),
  });
  await assert.rejects(
    streamTextWithTracking({ model, prompt: "test" }),
    /truncated \(finish reason: length, 13 characters\)/,
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
  assert.equal(safeError("token sk_live_exampleSecret123"), "token [REDACTED]");
});

test("UploadThing fetch removes content-length and preserves cancellation", async () => {
  const originalFetch = globalThis.fetch;
  const upstreamController = new AbortController();
  let receivedInit: RequestInit | undefined;
  globalThis.fetch = mock.fn(async (_input, init) => {
    receivedInit = init;
    return new Response("{}", { status: 200 });
  });

  try {
    await uploadThingFetch("https://api.uploadthing.test/v6/getFileUrl", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": "54",
      },
      body: new Uint8Array([1, 2, 3]),
      signal: upstreamController.signal,
    });

    const headers = new Headers(receivedInit?.headers);
    assert.equal(headers.has("content-length"), false);
    assert.equal(headers.get("content-type"), "application/json");
    assert.ok(receivedInit?.signal);
    upstreamController.abort();
    assert.equal(receivedInit?.signal?.aborted, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("voice routing uses the managed fallback chain only for English", () => {
  const template = `${VOICEOVER_SERVICE_IMPORT_TOKEN}\n${VOICEOVER_SERVICE_SETTER_TOKEN}`;

  assert.match(
    configureVoiceoverServicePrompt(template, "english"),
    /EduvidsTTSService/,
  );
  assert.match(
    configureVoiceoverServicePrompt(template, "french"),
    /GTTSService\(lang="fr"\)/,
  );
});

test("scene narration is split into short visual timing beats", () => {
  const narration =
    "A long explanation starts with one familiar idea, then connects it to a second idea that appears on screen, before ending with the result.";
  const [scene] = normalizeScenePlanTiming([
    {
      sceneId: "Scene01",
      narration,
      visualType: "comparison",
      elements: [
        { id: "first", type: "shape", content: "first shape" },
        { id: "second", type: "shape", content: "second shape" },
      ],
      layout: "left_right_split",
      maxSimultaneousElements: 2,
      transitionIn: "create",
      clearPrevious: false,
      labels: [],
      beats: [],
    },
  ]);
  assert.ok(scene.beats.length >= 2);
  assert.ok(
    scene.beats.every((beat) => beat.narration.split(/\s+/).length <= 18),
  );
  assert.equal(scene.beats.map((beat) => beat.narration).join(" "), narration);
  assert.deepEqual(scene.beats[0].focusElementIds, ["first"]);
  assert.deepEqual(scene.beats.at(-1)?.focusElementIds, ["second"]);
});

test("scene timing keeps faithful model-planned visual focus", () => {
  const narration =
    "The square stretches sideways. Its area grows while its height stays fixed.";
  const [scene] = normalizeScenePlanTiming([
    {
      sceneId: "Scene01",
      narration,
      visualType: "comparison",
      elements: [
        { id: "square", type: "shape", content: "unit square" },
        { id: "area", type: "region", content: "filled area" },
      ],
      layout: "left_right_split",
      maxSimultaneousElements: 2,
      transitionIn: "create",
      clearPrevious: false,
      labels: [],
      beats: [
        {
          narration: "The square stretches sideways.",
          focusElementIds: ["square"],
        },
        {
          narration: "Its area grows while its height stays fixed.",
          focusElementIds: ["area", "square"],
        },
      ],
    },
  ]);

  assert.deepEqual(scene.beats, [
    {
      narration: "The square stretches sideways.",
      focusElementIds: ["square"],
    },
    {
      narration: "Its area grows while its height stays fixed.",
      focusElementIds: ["area", "square"],
    },
  ]);
});

test("voiceover timing rejects long idle blocks before rendering", () => {
  const good = `class Scene01(VoiceoverScene):
    def construct(self):
        with self.voiceover(text="A short explanation appears with the diagram.") as tracker:
            self.play(FadeIn(diagram), run_time=max(0.4, tracker.duration * 0.8))
            self.wait(max(0, tracker.get_remaining_duration()))`;
  assert.deepEqual(manimVoiceoverTimingIssues(good, 1), []);

  const idle = `class Scene01(VoiceoverScene):
    def construct(self):
        with self.voiceover(text="This narration keeps going for far too long while the only visual action finishes almost immediately and leaves the viewer staring at a completely static screen without any useful visual progression.") as tracker:
            self.play(FadeIn(diagram), run_time=1)
            self.wait(tracker.get_remaining_duration())`;
  const issues = manimVoiceoverTimingIssues(idle, 2);
  assert.ok(issues.some((issue) => issue.includes("maximum is 22")));
  assert.ok(issues.some((issue) => issue.includes("final duration")));
  assert.ok(issues.some((issue) => issue.includes("2 planned beats")));
});

test("voiceover aligner closes every block with the guarded wait", () => {
  const loose = `class Scene01(VoiceoverScene):
    def construct(self):
        with self.voiceover(text="First the diagram appears.") as tracker:
            self.play(FadeIn(diagram), run_time=1)
            self.wait(tracker.get_remaining_duration())
        with self.voiceover(text="Then the arrow moves.") as t2:
            self.play(arrow.animate.shift(RIGHT))
            if show_label:
                self.add(label)
        # pause between beats
        with self.voiceover(text="Already aligned.") as tracker:
            self.play(Write(eq))
            self.wait(max(0, tracker.get_remaining_duration()))
        self.wait(1)`;
  assert.ok(manimVoiceoverTimingIssues(loose, 3).length > 0);
  const aligned = alignVoiceoverDurations(loose);
  assert.deepEqual(manimVoiceoverTimingIssues(aligned, 3), []);
  assert.match(
    aligned,
    /                self\.add\(label\)\n            self\.wait\(max\(0, t2\.get_remaining_duration\(\)\)\)\n/,
  );
  assert.equal(alignVoiceoverDurations(aligned), aligned);
});

test("voiceover timing accepts direct reveals and isolated narration holds", () => {
  const mixed = `class Scene01(VoiceoverScene):
    def construct(self):
        with self.voiceover(text="The diagram appears before we inspect it.") as tracker:
            self.add(diagram)
            self.wait(max(0, tracker.get_remaining_duration()))
        with self.voiceover(text="Notice how both sides stay balanced.") as tracker:
            self.wait(max(0, tracker.get_remaining_duration()))`;
  assert.deepEqual(manimVoiceoverTimingIssues(mixed, 2), []);

  const entirelyStatic = `class Scene01(VoiceoverScene):
    def construct(self):
        with self.voiceover(text="Nothing ever changes in this scene.") as tracker:
            self.wait(max(0, tracker.get_remaining_duration()))`;
  assert.ok(
    manimVoiceoverTimingIssues(entirelyStatic, 1).some((issue) =>
      issue.includes("no visual action in any voiceover block"),
    ),
  );
});

test("voiceover enforcement replaces model-selected gTTS and fills missing scene setters", () => {
  const generated = `from manim import *
from manim_voiceover import VoiceoverScene
from manim_voiceover.services.gtts import GTTSService

class Scene01Intro(VoiceoverScene, ThreeDScene):
    def construct(self):
        self.set_speech_service(GTTSService())
        self.wait(1)

class Scene02Summary(VoiceoverScene, ThreeDScene):
    def construct(self):
        self.wait(1)`;

  const english = enforceVoiceoverService(generated, "english");
  assert.equal(english.provider, "deepgram-aura-openrouter-gtts");
  assert.equal(
    english.script.match(/from eduvids_tts import EduvidsTTSService/g)?.length,
    1,
  );
  assert.equal(
    english.script.match(/self\.set_speech_service\(EduvidsTTSService\(\)\)/g)
      ?.length,
    2,
  );
  assert.doesNotMatch(english.script, /GTTSService/);

  const staleService = english.script
    .replace(
      "from eduvids_tts import EduvidsTTSService",
      "from eduvids_legacy_tts import LegacyTTSService",
    )
    .replaceAll("EduvidsTTSService()", "LegacyTTSService()");
  const french = enforceVoiceoverService(staleService, "french");
  assert.equal(french.provider, "gtts");
  assert.equal(
    french.script.match(/self\.set_speech_service\(GTTSService\(lang="fr"\)\)/g)
      ?.length,
    2,
  );
  assert.doesNotMatch(french.script, /LegacyTTSService|EduvidsTTSService/);
});

test("script repairs cannot switch an English job back to gTTS", async () => {
  const script = `from manim import *
from manim_voiceover import VoiceoverScene
from manim_voiceover.services.gtts import GTTSService

class Scene01(VoiceoverScene):
    def construct(self):
        self.set_speech_service(GTTSService())
        label = Text("test")
        label.fix_in_frame()`;

  const fixed = await fixManimScript({
    script,
    errors: "AttributeError: Text has no attribute 'fix_in_frame'",
    sessionId: "test-session",
    voiceoverLanguage: "english",
  });
  assert.match(fixed, /EduvidsTTSService/);
  assert.doesNotMatch(fixed, /GTTSService/);
  assert.match(fixed, /self\.add_fixed_in_frame_mobjects\(label\)/);
});

test("English TTS adapter prefers Aura-2 and locks one voice for the render", async () => {
  const folder = await mkdtemp(join(tmpdir(), "eduvids-tts-adapter-"));
  const adapter = join(folder, "eduvids_tts.py");
  const harness = join(folder, "verify_fallbacks.py");
  try {
    await writeFile(adapter, EDUVIDS_TTS_SERVICE_SOURCE);
    await exec("python3", ["-m", "py_compile", adapter]);
    assert.match(
      EDUVIDS_TTS_SERVICE_SOURCE,
      /if self\.deepgram_key:\s+providers\.append\("deepgram"\)\s+if self\.openrouter_key:\s+providers\.append\("openrouter"\)\s+providers\.append\("gtts"\)/,
    );
    assert.match(EDUVIDS_TTS_SERVICE_SOURCE, /deepgram\/flux-tts:free/);
    assert.match(EDUVIDS_TTS_SERVICE_SOURCE, /aura-2-hera-en/);
    assert.match(EDUVIDS_TTS_SERVICE_SOURCE, /LOCKED_PROVIDER/);
    assert.match(EDUVIDS_TTS_SERVICE_SOURCE, /"provider": provider/);
    assert.match(EDUVIDS_TTS_SERVICE_SOURCE, /"original_audio": filename/);

    await writeFile(
      harness,
      `import importlib.util
import os
import sys
import types
import urllib.error

cache_dir = ${JSON.stringify(folder)}

class SpeechService:
    cache_lookups = []

    def __init__(self, global_speed=1.0, **kwargs):
        self.cache_dir = cache_dir
        self.global_speed = global_speed

    def get_cached_result(self, input_data, cache_root):
        self.cache_lookups.append(input_data["provider"])
        return None

    def get_audio_basename(self, input_data):
        return "voiceover"

class FakeGTTS:
    calls = []

    def __init__(self, text, lang):
        self.calls.append((text, lang))

    def save(self, path):
        with open(path, "wb") as output:
            output.write(b"ID3" + b"g" * 256)

helper = types.ModuleType("manim_voiceover.helper")
helper.remove_bookmarks = lambda text: text
base = types.ModuleType("manim_voiceover.services.base")
base.SpeechService = SpeechService
sys.modules["manim_voiceover"] = types.ModuleType("manim_voiceover")
sys.modules["manim_voiceover.helper"] = helper
sys.modules["manim_voiceover.services"] = types.ModuleType("manim_voiceover.services")
sys.modules["manim_voiceover.services.base"] = base
gtts = types.ModuleType("gtts")
gtts.gTTS = FakeGTTS
sys.modules["gtts"] = gtts

spec = importlib.util.spec_from_file_location("eduvids_tts", ${JSON.stringify(adapter)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

class Response:
    headers = {"Content-Type": "audio/mpeg"}

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self):
        return b"ID3" + b"d" * 256

calls = []
def urlopen(request, timeout):
    calls.append(request.full_url)
    if request.full_url == module.OPENROUTER_SPEECH_URL:
        raise urllib.error.HTTPError(request.full_url, 429, "limited", {}, None)
    return Response()

os.environ["OPENROUTER_API_KEY"] = "openrouter-key"
os.environ["DEEPGRAM_API_KEY"] = "deepgram-key"
os.environ["DEEPGRAM_TTS_BASE_URL"] = "https://api.deepgram.test"
os.environ["DEEPGRAM_TTS_MODEL"] = "aura-2-hera-en"
os.environ["DEEPGRAM_TTS_SPEED"] = "1.0"
module.urllib.request.urlopen = urlopen
service = module.EduvidsTTSService()
result = service.generate_from_text("Use the primary narrator")
service.generate_from_text("Keep the same narrator")
assert calls == [
    "https://api.deepgram.test/v1/speak?model=aura-2-hera-en&encoding=mp3&speed=1.00",
    "https://api.deepgram.test/v1/speak?model=aura-2-hera-en&encoding=mp3&speed=1.00",
]
assert result["original_audio"].endswith(".mp3")
assert FakeGTTS.calls == []
assert SpeechService.cache_lookups == ["deepgram", "deepgram"]
assert module.LOCKED_PROVIDER == "deepgram"

module.LOCKED_PROVIDER = None
os.environ.pop("OPENROUTER_API_KEY")
os.environ.pop("DEEPGRAM_API_KEY")
fallback = module.EduvidsTTSService()
fallback.generate_from_text("Use the final fallback", path="fallback.mp3")
assert FakeGTTS.calls == [("Use the final fallback", "en")]
assert SpeechService.cache_lookups[-1] == "gtts"
`,
    );
    await exec("python3", [harness]);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("the deterministic outro names the previous video only in the final scene", async () => {
  const source = `from manim import *
class First(Scene):
    def construct(self):
        self.play(Wait(1))

class Last(Scene):
    def construct(self):
        self.play(Wait(1))`;
  const enhanced = injectEduvidsCallout(source, {
    videoId: "previous123",
    title: 'Why "Impossible" Equations Actually Work',
    watchUrl: "https://www.youtube.com/watch?v=previous123",
  });
  const folder = await mkdtemp(join(tmpdir(), "eduvids-outro-"));
  const script = join(folder, "outro.py");

  try {
    await writeFile(script, enhanced);
    await exec("python3", ["-m", "py_compile", script]);
    assert.equal(enhanced.match(/Watch next/g)?.length, 1);
    assert.ok(enhanced.indexOf("Watch next") > enhanced.indexOf("class Last"));
    // No block-capital tags on the end card.
    assert.doesNotMatch(enhanced, /Text\("[A-Z ]{5,}"/);
    assert.match(enhanced, /Link in description and top comment/);
    // The end card uses the house typography, not a hard-coded font.
    assert.doesNotMatch(enhanced, /font=/);
    assert.match(enhanced, /balanced_text\(/);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

const thumbnailCandidates: [string, string, string] = [
  "Why the Derivative of e^x Is Itself",
  "The Only Function That Equals Its Own Slope",
  "What Makes e So Special? Visualized",
];

test("thumbnail specs share one palette per video and keep each title's copy", () => {
  const titles = {
    selected: thumbnailCandidates[0],
    candidates: thumbnailCandidates,
    thumbnailConcepts: [
      {
        eyebrow: "Calculus",
        headline: "The slope is the height",
        accent: "height",
        visualConcept: "exp curve with a tangent",
        visual: { type: "function_plot" as const, expression: "exp(x)" },
      },
      {
        eyebrow: "Calculus",
        headline: "Its own derivative",
        accent: "own",
        visualConcept: "tangent",
        visual: { type: "function_plot" as const },
      },
      {
        eyebrow: "Constants",
        headline: "Why $e$ is special",
        accent: "$e$",
        visualConcept: "formula",
        visual: {
          type: "equation" as const,
          notation: "e=\\lim_{n\\to\\infty}(1+1/n)^n",
        },
      },
    ] as const,
  };
  const specs = buildThumbnailSpecs({
    titles: { ...titles, thumbnailConcepts: [...titles.thumbnailConcepts] },
    topic: "derivative of e^x",
    designSeed: "job-123",
  });
  assert.equal(new Set(specs.map(({ palette }) => palette)).size, 1);
  assert.ok(THUMBNAIL_PALETTES.includes(specs[0].palette));
  assert.deepEqual(
    specs.map(({ title }) => title),
    thumbnailCandidates,
  );
  assert.equal(specs[0].headline, "The slope is the height");
  assert.equal(specs[2].visual.type, "equation");

  // An equation hero without usable notation falls back to the topic's visual
  // instead of letting the renderer substitute an unrelated formula.
  const noNotation = buildThumbnailSpecs({
    titles: {
      ...titles,
      thumbnailConcepts: [
        titles.thumbnailConcepts[0],
        titles.thumbnailConcepts[1],
        { ...titles.thumbnailConcepts[2], visual: { type: "equation" } },
      ],
    },
    topic: "Bayes theorem and medical tests",
    designSeed: "job-123",
  });
  assert.equal(noNotation[2].visual.type, "probability");

  const bare = buildThumbnailSpecs({
    titles: {
      selected: thumbnailCandidates[0],
      candidates: thumbnailCandidates,
    },
    topic: "derivative of e^x",
    designSeed: "job-123",
  });
  assert.ok(bare.every(({ headline }) => headline === ""));
  assert.equal(bare[0].visual.type, "function_plot");
  assert.equal(
    inferVisualType("chemical luminescence and quantum emission"),
    "energy_levels",
  );

  // Every slot keeps its vetted diagram; video availability must not
  // replace the concept with a frame carrying tiny captions or other math.
  assert.deepEqual(
    specs.map(({ visual }) => visual),
    [
      { type: "function_plot", expression: "exp(x)" },
      { type: "function_plot" },
      { type: "equation", notation: "e=\\lim_{n\\to\\infty}(1+1/n)^n" },
    ],
  );
});

test("thumbnail rendering keeps diagrams even when the video sandbox is available", async () => {
  const commands: string[] = [];
  let writtenSpecs: { visual: { type: string } }[] = [];
  const connection = mock.method(
    Sandbox,
    "connect",
    async () =>
      ({
        commands: {
          run: async (command: string) => {
            commands.push(command);
            return { stdout: "" };
          },
        },
        files: {
          write: async (path: string, data: unknown) => {
            if (path.endsWith("specs.json"))
              writtenSpecs = JSON.parse(data as string);
          },
          read: async (path: string) =>
            path.endsWith("results.json")
              ? JSON.stringify(
                  Object.fromEntries(
                    [0, 1, 2].map((index) => [
                      index,
                      { ok: true, path: `/thumbnail-${index}.png` },
                    ]),
                  ),
                )
              : new Uint8Array([1, 2, 3]),
        },
      }) as never,
  );
  try {
    const result = await renderThumbnailCandidates({
      prepared: state("/tmp/fixture"),
      titles: {
        selected: thumbnailCandidates[0],
        candidates: thumbnailCandidates,
      },
      topic: "derivative of e^x",
      designSeed: "fixture",
    });
    assert.equal(result.images.filter(Boolean).length, 3);
    assert.deepEqual(
      writtenSpecs.map(({ visual }) => visual.type),
      ["function_plot", "function_plot", "function_plot"],
    );
    assert.ok(
      commands.every((command) => !/frame_picker|final\.mp4/.test(command)),
    );
  } finally {
    connection.mock.restore();
  }
});

async function thumbnailToolchainAvailable() {
  try {
    await exec("python3", ["-c", "import manim"]);
    await exec("xelatex", ["--version"]);
    return true;
  } catch {
    return false;
  }
}

test("thumbnail diagrams and equation colours remain readable in both render modes", async (t) => {
  if (!(await thumbnailToolchainAvailable())) {
    t.skip("manim and xelatex are not installed");
    return;
  }
  const { stdout } = await exec("python3", ["tests/thumbnail-layout.py"], {
    timeout: 240_000,
  });
  assert.match(stdout, /equation colours passed/);
});

test("thumbnail renderer produces verified 1280x720 PNGs and recovers in safe mode", async (t) => {
  if (!(await thumbnailToolchainAvailable())) {
    t.skip("manim and xelatex are not installed");
    return;
  }
  const folder = await mkdtemp(join(tmpdir(), "eduvids-thumbnail-render-"));
  try {
    const specs = [
      {
        palette: "teal-amber",
        eyebrow: "Calculus",
        headline: "The slope is the height",
        accent: "height",
        visual: {
          type: "function_plot",
          expression: "exp(x)",
          xRange: [-3, 2],
          notation: "f(x)=e^x",
        },
      },
      {
        palette: "azure-coral",
        eyebrow: "Complex numbers",
        headline: "Multiplying by $i$ is a quarter turn",
        accent: "quarter turn",
        visual: { type: "complex_plane", turn: 0.25 },
      },
      {
        // No finite samples: the full render fails and safe mode recovers.
        palette: "violet-amber",
        eyebrow: "Logarithms",
        headline: "Where $\\log$ breaks",
        accent: "breaks",
        visual: {
          type: "function_plot",
          expression: "log(x)",
          xRange: [-5, -1],
        },
      },
      {
        // Too wide beside a headline: safe mode draws a neutral visual.
        palette: "azure-coral",
        eyebrow: "Probability",
        headline: "Base rates decide",
        accent: "Base rates",
        visual: {
          type: "equation",
          notation: "P(A\\mid B)=\\frac{P(B\\mid A)\\,P(A)}{\\hl{P(B)}}",
        },
      },
      {
        // Disallowed notation is never replaced by an unrelated formula.
        palette: "azure-coral",
        eyebrow: "Probability",
        headline: "Base rates decide",
        accent: "Base rates",
        visual: { type: "equation", notation: "\\input{x}" },
      },
    ];
    await writeFile(join(folder, "specs.json"), JSON.stringify(specs));
    await exec(
      "python3",
      [
        join(process.cwd(), "src/lib/thumbnail/renderer.py"),
        "batch",
        "--spec",
        join(folder, "specs.json"),
        "--out-dir",
        join(folder, "out"),
        "--font-dir",
        join(process.cwd(), "src/lib/thumbnail/fonts"),
        "--timeout",
        "240",
      ],
      { timeout: 300_000 },
    );
    const results = JSON.parse(
      await readFile(join(folder, "out", "results.json"), "utf8"),
    ) as Record<
      string,
      {
        ok: boolean;
        path: string;
        report: { mode: string; warnings: string[] };
      }
    >;
    for (const index of ["0", "1", "2", "3", "4"]) {
      assert.equal(results[index]?.ok, true, `candidate ${index} rendered`);
      const png = await readFile(results[index]!.path);
      assert.equal(png.readUInt32BE(16), 1280);
      assert.equal(png.readUInt32BE(20), 720);
    }
    assert.equal(results["0"]!.report.mode, "full");
    assert.equal(results["1"]!.report.mode, "full");
    assert.equal(results["2"]!.report.mode, "safe");
    for (const index of ["3", "4"]) {
      const report = results[index]!.report as {
        mode: string;
        visual?: string;
      };
      assert.equal(report.mode, "safe");
      assert.equal(report.visual, "geometry");
    }
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("thumbnail headlines break at phrase boundaries", async (t) => {
  try {
    await exec("python3", ["-c", "import numpy"]);
  } catch {
    t.skip("python3 with numpy is not installed");
    return;
  }
  const headlines = [
    "The rate of change is~itself",
    "Walking down the~slope",
    "A donut is a coffee mug",
    "Multiplying by $i$ is a quarter turn",
    "Why a $\\pi$ hides in the bell~curve",
  ];
  const script = `
import json, sys
sys.path.insert(0, "src/lib/thumbnail")
import renderer
out = {}
for headline in json.loads(sys.argv[1]):
    words = renderer.split_words(headline)
    fitting = [o for o in renderer.line_options(words, None) if len(o[2]) > 1]
    out[headline] = [" ".join(w.text for w in words[a:b]) for a, b in fitting[0][2]]
print(json.dumps(out))
`;
  const { stdout } = await exec("python3", [
    "-c",
    script,
    JSON.stringify(headlines),
  ]);
  const breaks = JSON.parse(stdout) as Record<string, string[]>;
  assert.deepEqual(breaks["The rate of change is~itself"], [
    "The rate of change",
    "is~itself",
  ]);
  assert.deepEqual(breaks["Walking down the~slope"], [
    "Walking down",
    "the~slope",
  ]);
  assert.deepEqual(breaks["A donut is a coffee mug"], [
    "A donut",
    "is a coffee mug",
  ]);
  assert.deepEqual(breaks["Multiplying by $i$ is a quarter turn"], [
    "Multiplying by $i$",
    "is a quarter turn",
  ]);
  for (const lines of Object.values(breaks)) {
    for (const line of lines.slice(0, -1)) {
      assert.doesNotMatch(
        line,
        /\b(a|an|the|of)$/i,
        `line ends on an article: ${line}`,
      );
    }
    assert.ok(
      !lines.some((line) => /bell$/.test(line)),
      "bound phrase was split",
    );
  }
});

test("sanitizing Manim scripts removes disable_ligatures, which truncates text", () => {
  const sanitized = sanitizeManimScript(
    'from manim import *\nclass Demo(Scene):\n    def construct(self):\n        self.add(Text("Area of a Circle", font="EB Garamond", disable_ligatures=True, font_size=48))',
  );
  assert.doesNotMatch(sanitized, /disable_ligatures/);
  assert.match(
    sanitized,
    /Text\("Area of a Circle", font="EB Garamond", font_size=48\)/,
  );
});

test("sanitizing Python preserves comparisons and text containing angle brackets", () => {
  const script =
    'from manim import *\nclass Demo(Scene):\n    def construct(self):\n        x = Text("<hello>")\n        if 1 < x.width and x.width > 0:\n            self.add(x)';
  const sanitized = sanitizeManimScript(script);
  assert.ok(sanitized.includes('"<hello>"'));
  assert.ok(sanitized.includes("1 < x.width and x.width > 0"));
  assert.match(sanitized, /config\.background_color = "#0A0A0A"/);
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

test("videos use their thumbnail's palette and import the house style after their own imports", () => {
  const titles = {
    selected: thumbnailCandidates[0],
    candidates: thumbnailCandidates,
  };
  for (const seed of ["job-a", "job-b", "job-c", "job-d"]) {
    const [spec] = buildThumbnailSpecs({
      titles,
      topic: "e",
      designSeed: seed,
    });
    assert.equal(videoPalette(seed), spec.palette);
  }

  const source = `from manim import *
from manim_voiceover import VoiceoverScene
from eduvids_tts import (
    EduvidsTTSService,
)
config.background_color = "#050505"

class Scene01(VoiceoverScene):
    def construct(self):
        self.add(Text("Hi"))`;
  const styled = applyVideoStyle(source);
  const lines = styled.split("\n");
  const marker = lines.indexOf(VIDEO_STYLE_MARKER);
  assert.equal(lines[marker + 1], "from eduvids_style import *");
  assert.ok(marker > lines.indexOf(")"), "after the parenthesised import");
  assert.ok(marker < lines.findIndex((line) => line.startsWith("class ")));
  assert.match(styled, /config\.background_color = "#0A0A0A"/);
  assert.doesNotMatch(styled, /#050505/);
  assert.equal(applyVideoStyle(styled), styled);

  // A script that redefines house names gets them back before its scenes.
  const redefined = applyVideoStyle(`from manim import *
PRIMARY = BLUE
def balanced_text(text, font_size=36):
    return Text(text)

class Scene01(Scene):
    def construct(self):
        self.add(balanced_text("Hi"))`).split("\n");
  const again = redefined.findIndex((line) =>
    line.startsWith("from eduvids_style import *  #"),
  );
  assert.ok(again > redefined.indexOf("    return Text(text)"));
  assert.ok(again < redefined.findIndex((line) => line.startsWith("class ")));
});

test("all render paths use 1080p at 30fps and preserve portrait dimensions", () => {
  assert.deepEqual(videoRenderFlags(), [
    "--disable_caching",
    "--format=mp4",
    "-qh",
    "--fps",
    "30",
    // No PyPI version check after every render.
    "--silent",
  ]);
  assert.deepEqual(videoRenderFlags({ width: 1080, height: 1920 }).slice(-2), [
    "-r",
    "1080,1920",
  ]);
  assert.deepEqual(videoRenderFlags({ width: 721, height: 1279 }).slice(-2), [
    "-r",
    "722,1280",
  ]);
  assert.throws(() => videoRenderFlags({ width: NaN, height: 1920 }));
  assert.throws(() => videoRenderFlags({ width: 0, height: 1920 }));
});

test("house encoding supports legacy FFmpeg and PyAV Manim writers", async () => {
  await exec("python3", [
    join(process.cwd(), "tests/video-encoding.py"),
    join(process.cwd(), "src/lib/thumbnail/video_style.py"),
  ]);
});

test("an error raised during an animation ends the render at once instead of hanging", async (t) => {
  if (!(await thumbnailToolchainAvailable())) {
    t.skip("manim and xelatex are not installed");
    return;
  }
  const folder = await mkdtemp(join(tmpdir(), "eduvids-error-"));
  try {
    const assets = await loadVideoStyleAssets("teal-amber");
    await mkdir(join(folder, "eduvids-fonts"));
    await writeFile(join(folder, "eduvids_style.py"), assets.module);
    for (const { name, data } of assets.fonts)
      await writeFile(join(folder, "eduvids-fonts", name), data);
    await writeFile(
      join(folder, "boom.py"),
      `from manim import *
from eduvids_style import *
class Boom(Scene):
    def construct(self):
        dot = Dot()
        def fail(mob, dt):
            if self.renderer.time > 0.5:
                raise ValueError("script error mid-animation")
        dot.add_updater(fail)
        self.add(dot)
        self.play(dot.animate.shift(RIGHT), run_time=2)
`,
    );
    const started = Date.now();
    // Manim's encoder thread used to wait for frames forever, so the process
    // never exited and the render job ran into its 30-minute timeout.
    await assert.rejects(
      exec(
        "python3",
        ["-m", "manim", "boom.py", "Boom", "--disable_caching", "-ql"],
        { cwd: folder, timeout: 120_000, killSignal: "SIGKILL" },
      ),
      (error: { stderr?: string; stdout?: string; killed?: boolean }) =>
        !error.killed &&
        /script error mid-animation/.test(`${error.stdout}${error.stderr}`),
    );
    assert.ok(Date.now() - started < 60_000);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("a scene split into timeline segments joins into the same movie as a whole render", async (t) => {
  try {
    await exec("python3", ["-c", "import manim, manim_voiceover"]);
    await exec("ffmpeg", ["-version"]);
  } catch {
    t.skip("manim, manim-voiceover and ffmpeg are not installed");
    return;
  }
  const folder = await mkdtemp(join(tmpdir(), "eduvids-segments-"));
  try {
    await exec(
      "python3",
      [join(process.cwd(), "tests/render-segments.py"), folder],
      { cwd: folder, timeout: 240_000 },
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("real Manim geometry keeps grouped labels, overlay lanes and projected 3D layouts clear", async (t) => {
  if (!(await thumbnailToolchainAvailable())) {
    t.skip("manim and xelatex are not installed");
    return;
  }
  const folder = await mkdtemp(join(tmpdir(), "eduvids-quality-"));
  try {
    const assets = await loadVideoStyleAssets("azure-coral");
    await mkdir(join(folder, "eduvids-fonts"));
    await writeFile(join(folder, "eduvids_style.py"), assets.module);
    for (const { name, data } of assets.fonts)
      await writeFile(join(folder, "eduvids-fonts", name), data);
    await exec(
      "python3",
      [join(process.cwd(), "tests/video-quality.py"), folder],
      {
        cwd: folder,
        timeout: 240_000,
      },
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("storytelling helpers zoom, crowd, spotlight and draw props correctly in real Manim", async (t) => {
  if (!(await thumbnailToolchainAvailable())) {
    t.skip("manim and xelatex are not installed");
    return;
  }
  const folder = await mkdtemp(join(tmpdir(), "eduvids-devices-"));
  try {
    const assets = await loadVideoStyleAssets("azure-coral");
    await mkdir(join(folder, "eduvids-fonts"));
    await writeFile(join(folder, "eduvids_style.py"), assets.module);
    for (const { name, data } of assets.fonts)
      await writeFile(join(folder, "eduvids-fonts", name), data);
    await exec(
      "python3",
      [join(process.cwd(), "tests/visual-devices.py"), folder],
      { cwd: folder, timeout: 240_000 },
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("every storytelling helper the Manim prompt names is exported by the house style", async () => {
  const source = await readFile(
    join(process.cwd(), "src/lib/thumbnail/video_style.py"),
    "utf8",
  );
  const exported = new Set(
    [...source.matchAll(/__all__\s*\+?=\s*\[([\s\S]*?)\]/g)].flatMap(
      ([, names]) => [...names!.matchAll(/"(\w+)"/g)].map(([, name]) => name!),
    ),
  );
  const listed = MANIM_SYSTEM_PROMPT.match(
    /never redefine them: ([^.]+)\./,
  )![1]!
    .split(",")
    .map((name) => name.trim());
  for (const name of listed) assert.ok(exported.has(name), name);
  for (const name of [
    "crowd",
    "zoom_to",
    "reveal_detail",
    "scale_bar",
    "spotlight",
    "release",
    "explode",
    "assemble",
    "flow",
    "to_scale",
    "ghost",
    "atom",
    "molecule",
    "person",
    "die",
    "cell",
    "link",
    "block",
    "balance",
    "hop",
    "area_model",
    "split_bar",
    "bars",
    "cells",
    "network",
    "timeline",
    "slider",
    "callout",
    "trail",
    "gas",
  ]) {
    assert.ok(listed.includes(name), `prompt lists ${name}`);
  }
});

test("the planner names a visual device per scene and the narrator writes for pictures", () => {
  const devices = [
    "zoom_journey",
    "population",
    "to_scale",
    "exploded_view",
    "process_flow",
    "equation_link",
    "balance",
    "number_line",
    "area_model",
    "proportion_bar",
    "chart",
    "algorithm_steps",
    "network_walk",
    "timeline",
    "parameter_sweep",
    "labelled_anatomy",
    "particles",
    "trajectory",
    "spotlight",
    "before_after",
    "live_tracker",
    "morph",
    "predict_reveal",
    "analogy_morph",
    "build_up",
  ];
  for (const device of devices) {
    assert.match(SCENE_PLAN_SYSTEM_PROMPT, new RegExp(`"${device}"`));
  }
  // Every scene in every example names a device and a storyboard.
  const examples = SCENE_PLAN_SYSTEM_PROMPT.split("EXAMPLE ").slice(1);
  assert.ok(examples.length >= 5);
  for (const example of examples) {
    const json = example.slice(example.indexOf("["));
    const scenes = JSON.parse(json.slice(0, json.lastIndexOf("]") + 1));
    for (const scene of scenes) {
      assert.ok(devices.includes(scene.visualDevice), scene.sceneId);
      assert.ok(scene.storyboard.length > 20, scene.sceneId);
      assert.equal(
        scene.beats.map((beat: { narration: string }) => beat.narration).join(" "),
        scene.narration,
      );
    }
  }
  assert.match(VOICEOVER_SYSTEM_PROMPT, /TRAVEL THROUGH SCALE/);
  assert.match(VOICEOVER_SYSTEM_PROMPT, /MAKE NUMBERS COUNTABLE/);
  assert.match(VOICEOVER_SYSTEM_PROMPT, /GIVE EVERY QUANTITY A BODY/);
  assert.match(SCENE_PLAN_SYSTEM_PROMPT, /Every scene has a hero picture/);
  assert.match(SCENE_PLAN_SYSTEM_PROMPT, /VISUAL VOCABULARY BY SUBJECT/);
});

test("prompts carry no control characters from collapsed escapes", () => {
  // A single backslash in the TypeScript source turns \text into a tab and
  // \, into a comma, so the model would copy broken LaTeX.
  for (const prompt of [
    MANIM_SYSTEM_PROMPT,
    SCENE_PLAN_SYSTEM_PROMPT,
    VOICEOVER_SYSTEM_PROMPT,
  ]) {
    assert.doesNotMatch(prompt, /[\t\x08\x0b\x0c]/);
  }
  for (const latex of MANIM_SYSTEM_PROMPT.matchAll(/r"([^"]*)"/g)) {
    assert.doesNotMatch(latex[1]!, /(^|[^\\]),\\(?:text|mathrm)/, latex[1]);
  }
});

test("scene plan gaps flag text-only, unlinked formula, missing and repeated devices", () => {
  const scene = (
    sceneId: string,
    types: string[],
    visualDevice?: string,
  ): ScenePlanEntry => ({
    sceneId,
    narration: "x",
    visualType: "formula_explanation",
    visualDevice,
    elements: types.map((type, index) => ({
      id: `e${index}`,
      type: type as ScenePlanEntry["elements"][number]["type"],
      content: "x",
    })),
    layout: "center_single",
    maxSimultaneousElements: 3,
    transitionIn: "write",
    clearPrevious: true,
    labels: [],
    beats: [],
  });
  const gaps = scenePlanVisualGaps([
    scene("S1", ["text", "math"], "morph"),
    scene("S2", ["text"], "morph"),
    scene("S3", ["shape", "math"], "morph"),
    scene("S4", ["shape", "math"], "equation_link"),
    scene("S5", ["prop"]),
  ]);
  assert.match(gaps.join("\n"), /S1: only text and formulas/);
  assert.match(gaps.join("\n"), /S2: only text is planned/);
  assert.match(gaps.join("\n"), /S3: tie the formula/);
  assert.match(gaps.join("\n"), /S3: third "morph" scene in a row/);
  assert.ok(!gaps.some((gap) => gap.startsWith("S4")));
  assert.match(gaps.join("\n"), /S5: no visual device/);
  assert.deepEqual(
    scenePlanVisualGaps([scene("Good", ["population"], "population")]),
    [],
  );
});

test("scene timing keeps the planned device and storyboard", () => {
  const [scene] = normalizeScenePlanTiming([
    {
      sceneId: "Scene01Salt",
      narration: "Here is a grain of salt.",
      visualType: "geometry_diagram",
      visualDevice: "zoom_journey",
      storyboard: "A grain dissolves into a lattice and we zoom into one atom.",
      elements: [{ id: "grain", type: "shape", content: "square" }],
      layout: "center_single",
      maxSimultaneousElements: 2,
      transitionIn: "fade_in",
      clearPrevious: true,
      labels: [],
      beats: [],
    },
  ]);
  assert.equal(scene!.visualDevice, "zoom_journey");
  assert.match(scene!.storyboard!, /lattice/);
});

test("house style sets text and math on one type scale and keeps copy in frame", async (t) => {
  if (!(await thumbnailToolchainAvailable())) {
    t.skip("manim and xelatex are not installed");
    return;
  }
  const folder = await mkdtemp(join(tmpdir(), "eduvids-video-style-"));
  try {
    const assets = await loadVideoStyleAssets("azure-coral");
    await mkdir(join(folder, "eduvids-fonts"));
    await writeFile(join(folder, "eduvids_style.py"), assets.module);
    for (const { name, data } of assets.fonts) {
      await writeFile(join(folder, "eduvids-fonts", name), data);
    }
    const probe = join(folder, "probe.py");
    await writeFile(
      probe,
      `import json
from manim import *
from eduvids_style import *
config.media_dir = ${JSON.stringify(join(folder, "media"))}
text, math = Text("H"), MathTex(r"\\text{H}")
long = Text("An extremely long single line of copy that would run off the frame")
card = balanced_text("Generate your own educational videos for free", font_size=48, max_width=6)
titled = header("Transform of a constant", eyebrow="WORKED EXAMPLE")
surface = Surface(lambda u, v: [u, v, u * v], u_range=[-1, 1], v_range=[-1, 1], resolution=6)
print(json.dumps({
    "tags": [Text(tag).original_text for tag in ("SUMMARY", "KEY IDEA", "DNA REPLICATION", "FFT")],
    "header_parts": len(titled.submobjects),
    "surface_tones": len({face.get_fill_color().to_hex() for face in surface}),
    "text": text.height, "math": math.height,
    "font": text.font, "blue": BLUE.to_hex(), "primary": PRIMARY.to_hex(),
    "long": long.width, "limit": config.frame_width - 1,
    "lines": card.original_text.split("\\n"), "card": card.width,
    "card_size": card.height / len(card.original_text.split("\\n")), "line_size": Text("Hg", font_size=48).height,
}))
`,
    );
    const { stdout } = await exec("python3", [probe], {
      cwd: folder,
      timeout: 240_000,
    });
    const result = JSON.parse(stdout.trim().split("\n").pop()!);
    assert.equal(result.font, "CMU Serif");
    assert.ok(Math.abs(result.math / result.text - 1) < 0.02, stdout);
    assert.equal(result.blue.toUpperCase(), "#58C4DD");
    assert.equal(result.primary.toUpperCase(), "#58C4DD");
    assert.ok(result.long <= result.limit + 1e-6);
    // No block-capital tags: all-caps copy is set in sentence case, acronyms
    // survive, and header() drops the eyebrow.
    assert.deepEqual(result.tags, [
      "Summary",
      "Key idea",
      "DNA replication",
      "FFT",
    ]);
    assert.equal(result.header_parts, 1);
    // Surfaces are shaded by height, not a two-tone checkerboard.
    assert.ok(result.surface_tones > 4, stdout);
    assert.ok(result.card <= 6 + 1e-6);
    assert.ok(result.lines.length >= 2);
    // Wrapped, not shrunk: each line keeps roughly the requested size.
    assert.ok(result.card_size > result.line_size * 0.8, stdout);
    for (const line of result.lines.slice(0, -1)) {
      assert.doesNotMatch(line, /\b(?:a|an|the|of|for|your)$/i, line);
    }
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("the render job runs the driver with Manim flags, and in-frame watermarks skip re-encoding", () => {
  const prepared = {
    ...state("/home/user"),
    renderOptions: { resolution: { width: 720, height: 1280 } },
    watermarkInVideo: true,
  };
  const [python, driver, config] = renderJobCommand(prepared);
  assert.equal(python, "python");
  assert.equal(driver, "/home/user/eduvids_render.py");
  assert.deepEqual(JSON.parse(config!), {
    script: "/home/user/script.py",
    scenes: ["First", "Second"],
    media_dir: "/home/user/media",
    manim_args: [
      "--disable_caching",
      "--format=mp4",
      "-qh",
      "--fps",
      "30",
      "--silent",
      "-r",
      "720,1280",
    ],
    postprocess: "/home/user/postprocess.py",
  });
  assert.match(buildPostprocessScript(prepared), /\\"watermark\\":false/);
  assert.match(
    buildPostprocessScript(state("/home/user")),
    /\\"watermark\\":true/,
  );
});

test("render driver finds narration and formulas, and plans the costliest scenes first, splitting one that would hold up the rest", async (t) => {
  try {
    await exec("python3", ["-c", "import ast"]);
  } catch {
    t.skip("python3 is not installed");
    return;
  }
  const source = [
    "class A(Scene):",
    "    def construct(self):",
    `        with self.voiceover(text="${"a".repeat(900)}") as t:`,
    '            MathTex(r"x^2", "=", r"y", substrings_to_isolate=["x"])',
    '            axes.get_graph_label(c, label="y=x^2")',
    "            MathTex(name)",
    "class B(Scene):",
    "    def construct(self):",
    '        with self.voiceover(text="short") as t:',
    "            pass",
    "class D(VoiceoverScene, ThreeDScene):",
    "    def construct(self):",
    `        with self.voiceover(text="${"d".repeat(900)}") as t:`,
    "            path = TracedPath(dot.get_center)",
    "class C(VoiceoverScene, ThreeDScene):",
    "    def construct(self):",
    `        with self.voiceover(text="${"c".repeat(500)}") as t:`,
    "            pass",
  ].join("\n");
  const { stdout } = await exec("python3", [
    "-c",
    `import json, sys
sys.path.insert(0, "src/lib/thumbnail")
import render_driver as d
scenes = ["A", "B", "C", "D"]
narration, formulas, weights = d.analyse(json.loads(sys.argv[1]), scenes)
seconds = d.narrated_seconds(json.loads(sys.argv[1]), scenes)
print(json.dumps({"narration": len(narration), "formulas": [f[1] for f in formulas[:2]], "weights": weights,
                  "one": d.plan(scenes, weights, seconds, 1), "four": d.plan(scenes, weights, seconds, 4)}))`,
    JSON.stringify(source),
  ]);
  const result = JSON.parse(stdout);
  assert.equal(result.narration, 4);
  // A traced path records a point per frame: that scene never splits.
  assert.ok(
    result.four.every((task: unknown[]) => task[0] !== "D" || task[2] === 1),
    stdout,
  );
  assert.deepEqual(result.formulas, [["x^2", "=", "y"], ["y=x^2"]]);
  // A lit 3D scene costs several times its narration.
  assert.ok(result.weights.C > result.weights.A, stdout);
  // One worker: whole scenes, most expensive first.
  assert.deepEqual(
    result.one.map((task: unknown[]) => [task[0], task[2]]),
    [
      ["D", 1],
      ["C", 1],
      ["A", 1],
      ["B", 1],
    ],
  );
  // Four workers: the 3D scene is cut into contiguous segments of its
  // timeline, each still queued ahead of the cheap scene; the last segment
  // runs to the scene's end.
  const names = result.four.map((task: unknown[]) => task[0]);
  const segments = result.four.filter((task: unknown[]) => task[0] === "C");
  assert.ok(segments.length >= 2, stdout);
  assert.ok(names.lastIndexOf("C") < names.indexOf("B"), stdout);
  for (let index = 0; index < segments.length; index++) {
    assert.equal(segments[index][1], index);
    assert.equal(segments[index][2], segments.length);
    if (index > 0) assert.equal(segments[index][3], segments[index - 1][4]);
  }
  assert.equal(segments[0][3], 0);
  assert.ok(segments.at(-1)[4] > 1e6);
});

test("layout guard moves a label off a line and inside the frame, but keeps a value inside its circle", async (t) => {
  if (!(await thumbnailToolchainAvailable())) {
    t.skip("manim and xelatex are not installed");
    return;
  }
  const folder = await mkdtemp(join(tmpdir(), "eduvids-layout-guard-"));
  try {
    const assets = await loadVideoStyleAssets("teal-amber");
    await mkdir(join(folder, "eduvids-fonts"));
    await writeFile(join(folder, "eduvids_style.py"), assets.module);
    for (const { name, data } of assets.fonts) {
      await writeFile(join(folder, "eduvids-fonts", name), data);
    }
    const probe = join(folder, "probe.py");
    await writeFile(
      probe,
      `import json
from manim import *
from eduvids_style import *
config.media_dir = ${JSON.stringify(join(folder, "media"))}
scene = Scene()
line = Line(LEFT * 4, RIGHT * 4)
ring = Circle(radius=0.8).shift(DOWN * 2)
scene.add(line, ring)
label = Text("on the line", font_size=28)
inside = Text("10", font_size=36).move_to(ring)
edge = Text("off the edge", font_size=28).move_to([config.frame_width / 2, 2, 0])
start = inside.get_center().copy()
scene.add(label, inside, edge)
print(json.dumps({
    "clear": bool(label.get_bottom()[1] > 0.05 or label.get_top()[1] < -0.05),
    "inside_moved": float(np.linalg.norm(inside.get_center() - start)),
    "edge_right": float(edge.get_right()[0]), "half": config.frame_width / 2,
}))
`,
    );
    const { stdout } = await exec("python3", [probe], {
      cwd: folder,
      timeout: 240_000,
    });
    const result = JSON.parse(stdout.trim().split("\n").pop()!);
    assert.ok(result.clear, stdout);
    assert.equal(result.inside_moved, 0);
    assert.ok(result.edge_right < result.half - 0.25, stdout);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("wrapped or positional voiceover headers are normalized to one timed line", () => {
  const source = [
    "class A(VoiceoverScene):",
    "    def construct(self):",
    "        with self.voiceover(",
    '            text="A long narration line"',
    "        ) as tracker:",
    "            self.play(Create(c), run_time=tracker.duration * 0.6)",
    "            self.wait(max(0, tracker.get_remaining_duration()))",
    '        with self.voiceover("Positional") as tracker:  # beat 2',
    "            self.play(Create(c), run_time=tracker.duration * 0.6)",
    "            self.wait(max(0, tracker.get_remaining_duration()))",
  ].join("\n");
  const sanitized = sanitizeManimScript(source);
  assert.match(
    sanitized,
    /^ {8}with self\.voiceover\(text="A long narration line"\) as tracker:$/m,
  );
  assert.match(
    sanitized,
    /^ {8}with self\.voiceover\(text="Positional"\) as tracker:$/m,
  );
  assert.deepEqual(manimVoiceoverTimingIssues(sanitized, 2), []);
});

test("postprocessing keeps each scene's narration aligned with its picture", async () => {
  const folder = await mkdtemp(join(tmpdir(), "workflow-sync-"));
  try {
    const prepared = {
      ...state(folder),
      sceneNames: ["First", "Second", "Third"],
      watermarkInVideo: true,
    };
    const outputs = `${folder}/media/p0/videos/script/720p30`;
    await mkdir(outputs, { recursive: true });
    // Each scene: 2s of video, narration only in its first 0.5s (as when a
    // scene ends with a silent fade-out).
    for (const scene of prepared.sceneNames) {
      await exec("ffmpeg", [
        "-v",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=blue:s=160x90:d=2:r=30",
        "-f",
        "lavfi",
        "-i",
        "sine=frequency=440:duration=0.5",
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        `${outputs}/${scene}.mp4`,
      ]);
    }
    const script = join(folder, "process.py");
    await writeFile(script, buildPostprocessScript(prepared));
    await exec("python3", [script]);
    const { stdout } = await exec("python3", [
      "-c",
      `import subprocess, numpy as np
pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', ${JSON.stringify(join(folder, "final.mp4"))}, '-ac', '1', '-ar', '8000', '-f', 's16le', '-'], stdout=subprocess.PIPE).stdout
a = np.abs(np.frombuffer(pcm, dtype=np.int16).astype(float))
print(' '.join(str(int(a[int(t * 8000):int(t * 8000) + 800].mean())) for t in (0.2, 1.2, 2.2, 3.2, 4.2, 5.2)))`,
    ]);
    const [s1, gap1, s2, gap2, s3, gap3] = stdout.trim().split(" ").map(Number);
    for (const loud of [s1, s2, s3]) assert.ok(loud! > 1000, stdout);
    for (const quiet of [gap1, gap2, gap3]) assert.ok(quiet! < 50, stdout);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});
