import { test } from "node:test";
import assert from "node:assert/strict";
import { toStoryboard } from "../src/lib/storyboard";

test("storyboard keeps one sentence per scene and the chapter it opens", () => {
  const storyboard = toStoryboard([
    {
      chapterTitle: "The puzzle",
      narration: "Why does 0.999… equal 1? Most people say it is just below.",
    },
    { narration: "Write the gap as a number. It keeps shrinking." },
    { chapterTitle: "  ", narration: "   " },
  ]);

  assert.deepEqual(storyboard, [
    { chapter: "The puzzle", caption: "Why does 0.999… equal 1?" },
    { chapter: undefined, caption: "Write the gap as a number." },
  ]);
});

test("storyboard caps a long sentence", () => {
  const [scene] = toStoryboard([{ narration: "word ".repeat(60) }]);
  assert.ok(scene.caption.length <= 140);
  assert.ok(scene.caption.endsWith("…"));
});
