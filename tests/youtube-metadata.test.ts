import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildChapters,
  buildPreviousVideoComment,
  buildYouTubeDescription,
  formatChapterTimestamp,
  parseVideoDescriptionPackage,
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

test("slot B is always the visual-only thumbnail", () => {
  const titles = parseVideoTitleSet(
    JSON.stringify(
      [
        "Why the Slope at a Single Point Isn't a Paradox",
        "What a Derivative Actually Measures",
        "Zoom In Forever and Curves Turn Into Lines",
      ].map((title) => ({
        title,
        thumbnailText: "0/0?",
        visualConcept: "parabola with a red tangent point",
        visualType: "function_plot",
        mathNotation: "f'(x)",
        plotExpression: "x^2",
        plotXRange: [-3, 3],
      })),
    ),
  );
  assert.equal(titles.thumbnailConcepts?.[0].text, "0/0?");
  assert.equal(titles.thumbnailConcepts?.[1].text, "");
  assert.equal(titles.thumbnailConcepts?.[1].mathNotation, "");
  assert.equal(titles.thumbnailConcepts?.[2].text, "0/0?");
});

test("short punchy titles are accepted", () => {
  const titles = parseVideoTitleSet(
    '["The Phone Number Puzzle", "Why Primes Make Spirals", "The Scariest Chart in Math"]',
  );
  assert.equal(titles.selected, "The Phone Number Puzzle");
});

test("description package parses hook, hashtags and tags with a plain-text fallback", () => {
  const parsed = parseVideoDescriptionPackage(`\`\`\`json
{"hook": ["Pick one point on a curve. How steep is it there?", "One parabola and a shrinking secant line show what a derivative measures."],
 "hashtags": ["#Math", "calculus", "#Instant Rate", "#!!"], "tags": ["What is a derivative", "derivative intuition", "x"]}
\`\`\``);
  assert.equal(parsed.hook.split("\n").length, 2);
  assert.deepEqual(parsed.hashtags, ["#Math", "#Calculus", "#InstantRate"]);
  assert.deepEqual(parsed.tags, [
    "what is a derivative",
    "derivative intuition",
  ]);

  const plain = parseVideoDescriptionPackage("Line one.\nLine two.");
  assert.equal(plain.hook, "Line one.\nLine two.");
  assert.deepEqual(plain.hashtags, []);
});

test("chapters follow rendered scene lengths and YouTube's chapter rules", () => {
  const plan = [
    { sceneId: "Scene01Intro", chapterTitle: "The slope that shouldn't exist" },
    { sceneId: "Scene02Secant" },
    { sceneId: "Scene03Shrink", chapterTitle: "Shrinking the gap" },
    { sceneId: "Scene04Blip", chapterTitle: "Too short to keep" },
    { sceneId: "Scene05Limit", chapterTitle: "The limit" },
  ];
  const timings = [
    { scene: "Scene01Intro", seconds: 21.4 },
    { scene: "Scene02Secant", seconds: 30 },
    { scene: "Scene03Shrink", seconds: 40.2 },
    { scene: "Scene04Blip", seconds: 4 },
    { scene: "Scene05Limit", seconds: 65 },
  ];
  assert.deepEqual(buildChapters(timings, plan), [
    { start: 0, title: "The slope that shouldn't exist" },
    { start: 51.4, title: "Shrinking the gap" },
    { start: 95.6, title: "The limit" },
  ]);
  // Class names that don't match the plan fall back to order when counts agree.
  assert.equal(
    buildChapters(
      timings.map((timing, index) => ({ ...timing, scene: `Other${index}` })),
      plan,
    ).length,
    3,
  );
  // Fewer than three usable chapters means no chapters at all.
  assert.deepEqual(buildChapters(timings.slice(0, 2), plan.slice(0, 2)), []);
  assert.equal(formatChapterTimestamp(95.6), "1:35");
  assert.equal(formatChapterTimestamp(3725), "1:02:05");
});

test("description lists chapters before links and ends with hashtags", () => {
  const result = buildYouTubeDescription({
    salesCopy: "Hook one.\nHook two.",
    previousVideo,
    chapters: [
      { start: 0, title: "The puzzle" },
      { start: 42, title: "Shrinking the gap" },
      { start: 125, title: "The limit" },
    ],
    hashtags: ["#Math", "#Calculus"],
  });
  assert.match(
    result,
    /\n\n0:00 The puzzle\n0:42 Shrinking the gap\n2:05 The limit\n\nPrevious:/,
  );
  assert.ok(result.endsWith("#Math #Calculus"));
});
