import { test } from "node:test";
import assert from "node:assert/strict";
import { vttToText } from "../src/lib/transcripts";

test("vtt captions become plain paragraphs without repeats", () => {
  const vtt = `WEBVTT
Kind: captions
Language: en

00:00:00.000 --> 00:00:02.000
Why must the area

00:00:01.500 --> 00:00:03.000 align:start
Why must the area
under a curve equal <c>one</c>?

00:00:03.000 --> 00:00:05.000
Because probability adds up &amp; stops at 1.
`;
  assert.equal(
    vttToText(vtt),
    "Why must the area under a curve equal one? Because probability adds up & stops at 1.",
  );
});

test("long transcripts are split into paragraphs", () => {
  const vtt = Array.from({ length: 6 }, (_, i) => `Sentence ${i}.`).join("\n");
  assert.equal(vttToText(vtt).split("\n\n").length, 2);
});
