import { test } from "node:test";
import assert from "node:assert/strict";
import {
  evaluatePacing,
  pacingQaMode,
  parsePacingReport,
} from "../src/lib/pacing-qa";
import { buildPostprocessScript } from "../src/lib/workflow/sandbox-jobs";
import type { PreparedSandboxState } from "../src/lib/e2b";

test("a Short that holds one frame for 11 s of its opening is held back", () => {
  // The stapler Short: one 10.9 s freeze from 9.5 s to 20.4 s, plus a shorter
  // one, out of a 45 s video.
  const verdict = evaluatePacing({
    duration: 45,
    freezes: [
      [2, 6],
      [9.5, 20.4],
      [22, 30],
    ],
    silences: [],
  });
  assert.equal(verdict.ok, false);
  assert.ok(verdict.frozenShareOfOpening > 0.7);
  assert.equal(verdict.longestFreeze.toFixed(1), "10.9");
  assert.equal(verdict.problems.length, 2);
  assert.match(verdict.problems[0]!, /76% of the first 30 s is a frozen frame/);
  assert.match(verdict.problems[1]!, /frozen frame for 10\.9 s from 9\.5 s/);
});

test("2 s silent gaps between scenes fail even when the picture moves", () => {
  const verdict = evaluatePacing({
    duration: 60,
    freezes: [],
    silences: [
      [5.1, 7.0],
      [11.2, 13.1],
      [16.0, 18.0],
    ],
  });
  assert.equal(verdict.ok, false);
  assert.deepEqual(verdict.problems, [
    "silence for 2.0 s from 16.0 s (limit 1.0 s)",
  ]);
});

test("a healthy Short passes: short freezes and pauses only", () => {
  const verdict = evaluatePacing({
    duration: 50,
    freezes: [
      [4, 6.5],
      [14, 16.8],
    ],
    silences: [[8, 8.85]],
  });
  assert.equal(verdict.ok, true, verdict.problems.join("; "));
  assert.ok(Math.abs(verdict.frozenShareOfOpening - 5.3 / 30) < 1e-9);
});

test("the opening share is measured over the video when it is under 30 s", () => {
  const verdict = evaluatePacing({
    duration: 10,
    freezes: [[6, 9.5]],
    silences: [],
  });
  assert.equal(verdict.ok, false);
  assert.match(verdict.problems[0]!, /35% of the first 10 s/);
});

test("quiet that runs into the end of the video is the ending, not a gap", () => {
  const verdict = evaluatePacing({
    duration: 40,
    freezes: [],
    silences: [[38.2, 40]],
  });
  assert.equal(verdict.ok, true);
});

test("reports from the render job are validated", () => {
  assert.deepEqual(
    parsePacingReport(
      '{"duration": 12.5, "freezes": [[1, 3.5]], "silences": []}',
    ),
    { duration: 12.5, freezes: [[1, 3.5]], silences: [] },
  );
  assert.equal(parsePacingReport('{"error": "ffmpeg failed"}'), null);
  assert.equal(parsePacingReport("not json"), null);
  assert.equal(
    parsePacingReport('{"duration": 3, "freezes": [[1]], "silences": []}'),
    null,
  );
});

test("PACING_QA picks block, warn or off", () => {
  assert.equal(pacingQaMode(undefined), "block");
  assert.equal(pacingQaMode("WARN"), "warn");
  assert.equal(pacingQaMode("off"), "off");
  assert.equal(pacingQaMode("nonsense"), "block");
});

test("the postprocess measures the final cut with the same filters", () => {
  const script = buildPostprocessScript({
    sandboxId: "sandbox",
    scriptPath: "/home/user/script.py",
    mediaDir: "/home/user/media",
    sceneNames: ["One"],
    applyWatermark: false,
    variant: "short",
  } as unknown as PreparedSandboxState);
  assert.match(script, /freezedetect=n=0\.0005:d=2/);
  assert.match(script, /silencedetect=noise=-40dB:d=0\.8/);
  assert.match(script, /pacing_qa\.json/);
});
