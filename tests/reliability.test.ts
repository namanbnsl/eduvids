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
} from "../src/lib/workflow/sandbox-jobs";
import {
  configureVoiceoverServicePrompt,
  enforceVoiceoverService,
  fixManimScript,
  manimVoiceoverTimingIssues,
  normalizeScenePlanTiming,
  streamTextWithTracking,
  sanitizeManimScript,
} from "../src/lib/llm";
import { injectEduvidsCallout } from "../src/lib/e2b";
import {
  VOICEOVER_SERVICE_IMPORT_TOKEN,
  VOICEOVER_SERVICE_SETTER_TOKEN,
} from "../src/prompt";
import {
  buildThumbnailManimScript,
  sanitizeGeneratedThumbnailScript,
  THUMBNAIL_CLASS_NAMES,
  thumbnailManimScriptIssues,
} from "../src/lib/youtube-thumbnail";
import {
  safeError,
  generationFailureMessage,
} from "../src/lib/workflow/errors";
import type { PreparedSandboxState } from "../src/lib/e2b";
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
    assert.equal(enhanced.match(/PREVIOUS VIDEO/g)?.length, 1);
    assert.ok(
      enhanced.indexOf("PREVIOUS VIDEO") > enhanced.indexOf("class Last"),
    );
    assert.match(enhanced, /Link in description and top comment/);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("thumbnail packaging creates three title-paired Manim scenes", async () => {
  const candidates: [string, string, string] = [
    "What Even Is a Tensor? Visualized From 0D to 3D",
    "Why Tensors Actually Change Shape Between Coordinates",
    "How Tensors Describe the World Without Breaking Physics",
  ];
  const source = buildThumbnailManimScript({
    topic: "Explain tensors geometrically",
    designSeed: "video-job-123",
    titles: {
      selected: candidates[0],
      candidates,
      thumbnailConcepts: [
        {
          text: "",
          visualConcept: "a cube stretching between coordinate grids",
          visualType: "transformation",
          mathNotation: "T(\\vec v)",
        },
        {
          text: "Same tensor",
          visualConcept: "one vector shown in two coordinate frames",
          visualType: "transformation",
          mathNotation: "[v]_{B}",
        },
        {
          text: "What stays fixed?",
          visualConcept: "a glowing invariant inside rotating axes",
          visualType: "geometry",
          mathNotation: "T",
        },
      ],
    },
  });
  const alternate = buildThumbnailManimScript({
    topic: "Explain tensors geometrically",
    designSeed: "video-job-456",
    titles: { selected: candidates[0], candidates },
  });
  const expectedThumbnailText = [
    "T(\\\\vec v)",
    "Same tensor",
    "What stays fixed?",
  ];
  const folder = await mkdtemp(join(tmpdir(), "eduvids-thumbnails-"));
  const script = join(folder, "thumbnails.py");

  try {
    await writeFile(script, source);
    await exec("python3", ["-m", "py_compile", script]);
    for (const [index, sceneClass] of THUMBNAIL_CLASS_NAMES.entries()) {
      assert.match(
        source,
        new RegExp(`class ${sceneClass}\\((?:Scene|ThreeDScene)\\)`),
      );
      assert.ok(source.includes(expectedThumbnailText[index]!));
      assert.ok(source.includes(JSON.stringify(candidates[index])));
    }
    assert.doesNotMatch(source, /brand_mark|cinematic_frame|EDUVIDS/);
    assert.match(source, /config\.background_color = "#050505"/);
    assert.notEqual(source, alternate);
    assert.doesNotMatch(source, /voiceover|bookmark/i);
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test("generated thumbnail scripts are title-paired and reject unsafe Python", () => {
  const candidates: [string, string, string] = [
    "What Even Is a Tensor? Visualized From 0D to 3D",
    "Why Tensors Actually Change Shape Between Coordinates",
    "How Tensors Describe the World Without Breaking Physics",
  ];
  const titles = { selected: candidates[0], candidates };
  const safe = sanitizeGeneratedThumbnailScript(`\`\`\`python
from manim import *
import numpy as np
config.background_color = "#050505"
class EduvidsThumbnailA(Scene):
    def construct(self):
        paired_title = ${JSON.stringify(candidates[0])}
        self.add(Circle())
class EduvidsThumbnailB(ThreeDScene):
    def construct(self):
        paired_title = ${JSON.stringify(candidates[1])}
        self.add(Sphere())
class EduvidsThumbnailC(Scene):
    def construct(self):
        paired_title = ${JSON.stringify(candidates[2])}
        self.add(Axes())
\`\`\``);
  assert.deepEqual(thumbnailManimScriptIssues(safe, titles), []);
  assert.ok(
    thumbnailManimScriptIssues(`${safe}\nimport os`, titles).some((issue) =>
      issue.includes("disallowed"),
    ),
  );
});

test("generated graph thumbnails must use the title package expression", () => {
  const candidates: [string, string, string] = [
    "Why This Function Bends Exactly Where It Does",
    "What the Derivative Knows About Every Turn",
    "How One Curve Reveals Its Own Rate of Change",
  ];
  const script = `from manim import *
import numpy as np
config.background_color = "#050505"
class EduvidsThumbnailA(Scene):
    def construct(self):
        paired_title = ${JSON.stringify(candidates[0])}
        self.add(Axes().plot(lambda x: np.cos(x)))
class EduvidsThumbnailB(Scene):
    def construct(self):
        paired_title = ${JSON.stringify(candidates[1])}
        self.add(Circle())
class EduvidsThumbnailC(Scene):
    def construct(self):
        paired_title = ${JSON.stringify(candidates[2])}
        self.add(Circle())`;
  const issues = thumbnailManimScriptIssues(script, {
    selected: candidates[0],
    candidates,
    thumbnailConcepts: [
      {
        text: "",
        visualConcept: "the exact source function",
        visualType: "function_plot",
        plotExpression: "sin(x)+x^2",
      },
      {
        text: "",
        visualConcept: "a tangent touching one turning curve",
        visualType: "geometry",
      },
      {
        text: "",
        visualConcept: "a curve and its local slope triangle",
        visualType: "geometry",
      },
    ],
  });
  assert.ok(issues.some((issue) => issue.includes("exact plot expression")));
});

test("sanitizing Python preserves comparisons and text containing angle brackets", () => {
  const script =
    'from manim import *\nclass Demo(Scene):\n    def construct(self):\n        x = Text("<hello>")\n        if 1 < x.width and x.width > 0:\n            self.add(x)';
  const sanitized = sanitizeManimScript(script);
  assert.ok(sanitized.includes('"<hello>"'));
  assert.ok(sanitized.includes("1 < x.width and x.width > 0"));
  assert.match(sanitized, /config\.background_color = "#050505"/);
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
