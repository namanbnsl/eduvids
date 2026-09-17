import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPreviousVideoComment,
  buildYouTubeDescription,
  parseVideoTitleSet,
  sanitizeThumbnailPlotExpression,
  selectThumbnailPair,
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

test("title packaging preserves explicit thumbnail-title concepts", () => {
  const titles = parseVideoTitleSet(
    JSON.stringify([
      {
        title: "What Even Is a Tensor? Visualized From 0D to 3D",
        thumbnailText: "",
        visualConcept: "a cube stretching between coordinate grids",
        visualType: "transformation",
        mathNotation: "T(\\vec v)",
      },
      {
        title: "Why Tensors Actually Change Shape Between Coordinates",
        thumbnailText: "SAME OBJECT",
        visualConcept: "one arrow shown in two skewed coordinate frames",
        visualType: "transformation",
        mathNotation: "[v]_{B}",
      },
      {
        title: "How Tensors Describe the World Without Breaking Physics",
        thumbnailText: "STAYS TRUE",
        visualConcept: "a glowing invariant inside rotating axes",
        visualType: "geometry",
        mathNotation: "T",
      },
    ]),
  );

  assert.equal(titles.thumbnailConcepts?.[0].text, "");
  assert.equal(titles.thumbnailConcepts?.[0].visualType, "transformation");
  assert.equal(titles.thumbnailConcepts?.[0].mathNotation, "T(\\vec v)");
  assert.equal(
    selectThumbnailPair(titles, [
      { title: titles.candidates[1], thumbnailUrl: "second.png" },
      { title: titles.selected, thumbnailUrl: "selected.png" },
    ])?.thumbnailUrl,
    "selected.png",
  );
  assert.equal(
    selectThumbnailPair(titles, [
      { title: titles.candidates[1], thumbnailUrl: "wrong.png" },
    ]),
    undefined,
  );
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

test("thumbnail plot expressions accept math but reject executable Python", () => {
  assert.equal(sanitizeThumbnailPlotExpression("sin(x) + x^2"), "sin(x)+x**2");
  assert.equal(sanitizeThumbnailPlotExpression("2x"), "");
  assert.equal(sanitizeThumbnailPlotExpression("sinx"), "");
  assert.equal(
    sanitizeThumbnailPlotExpression('__import__("os").system("id")'),
    "",
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
