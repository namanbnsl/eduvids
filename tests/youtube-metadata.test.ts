import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPreviousVideoComment,
  buildYouTubeDescription,
  parseVideoTitleSet,
  type RelatedYouTubeVideo,
} from "../src/lib/youtube-metadata";

const previousVideo: RelatedYouTubeVideo = {
  videoId: "previous123",
  title: "Why Differentiation Actually Works",
  watchUrl: "https://www.youtube.com/watch?v=previous123",
};

test("title packaging keeps exactly three clean curiosity-led candidates", () => {
  const titles = parseVideoTitleSet(`\`\`\`json
  [
    "What Even Is a Tensor? Visualized From 0D to 3D",
    "Why Tensors Actually Change Shape Between Coordinates",
    "How Tensors Describe the World Without Breaking Physics"
  ]
  \`\`\``);

  assert.equal(
    titles.selected,
    "What Even Is a Tensor? Visualized From 0D to 3D",
  );
  assert.equal(titles.candidates.length, 3);
});

test("title packaging rejects textbook boilerplate", () => {
  assert.throws(
    () =>
      parseVideoTitleSet(
        '["Tensor Basics", "Tensors Explained", "Introduction to Tensors"]',
      ),
    /three usable candidates/,
  );
});

test("description preserves a sales-first opening and adds deterministic links", () => {
  const result = buildYouTubeDescription({
    salesCopy:
      "Why can a derivative predict motion at one exact instant?\nMoving geometry reveals how limits, slopes, and instantaneous rate of change fit together.",
    previousVideo,
  });
  const lines = result.split("\n");

  assert.match(lines[0], /^Why can a derivative/);
  assert.match(lines[1], /limits, slopes/);
  assert.match(result, /Previous: Why Differentiation Actually Works/);
  assert.match(result, /https:\/\/eduvids\.app/);
});

test("previous-video comment has one focused CTA", () => {
  assert.equal(
    buildPreviousVideoComment(previousVideo),
    "Previous: Why Differentiation Actually Works → https://www.youtube.com/watch?v=previous123",
  );
});
