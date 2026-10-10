import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildPreviousVideoComment,
  buildYouTubeDescription,
  parseVideoTitleSet,
  sanitizeThumbnailHeadline,
  sanitizeThumbnailLatex,
  sanitizeThumbnailPlotExpression,
  sanitizeThumbnailSurfaceExpression,
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

test("title packaging keeps validated thumbnail copy and visual parameters", () => {
  const titles = parseVideoTitleSet(
    JSON.stringify([
      {
        title: "What Even Is a Tensor? Visualized From 0D to 3D",
        eyebrow: "Linear algebra",
        headline: "A tensor moves space",
        accent: "moves space",
        visualConcept: "a grid sheared by a matrix",
        visual: {
          type: "transformation",
          matrix: [
            [1, 1],
            [0, 1],
          ],
          rogue: "x",
        },
      },
      {
        title: "Why Tensors Actually Change Shape Between Coordinates",
        eyebrow: "Physics",
        headline: "Same arrow, two $\\vec v$",
        accent: "$\\vec v$",
        visualConcept: "one arrow in two frames",
        visual: { type: "complex_plane", turn: 2 },
      },
      {
        title: "How Tensors Describe the World Without Breaking Physics",
        eyebrow: "Geometry",
        headline: "What stays the same",
        accent: "not in headline",
        visualConcept: "an invariant",
        visual: { type: "equation", notation: "\\input{/etc/passwd}" },
      },
    ]),
  );

  const [first, second, third] = titles.thumbnailConcepts!;
  assert.equal(first.headline, "A tensor moves space");
  assert.equal(first.accent, "moves space");
  assert.deepEqual(first.visual, {
    type: "transformation",
    matrix: [
      [1, 1],
      [0, 1],
    ],
  });
  assert.equal(second.accent, "$\\vec v$");
  assert.deepEqual(second.visual, { type: "complex_plane" });
  assert.equal(third.accent, "");
  assert.deepEqual(third.visual, { type: "equation" });
});

test("legacy flat thumbnail fields still map onto the visual spec", () => {
  const titles = parseVideoTitleSet(
    JSON.stringify(
      [0, 1, 2].map((index) => ({
        title: `Why Differentiation Actually Works, Part ${index + 1} of It`,
        thumbnailText: "Slope is height",
        visualConcept: "a tangent",
        visualType: "function_plot",
        mathNotation: "f'(x)",
        plotExpression: "sin(x)+x^2",
        plotXRange: [-3, 3],
      })),
    ),
  );
  assert.deepEqual(titles.thumbnailConcepts?.[0].visual, {
    type: "function_plot",
    notation: "f'(x)",
    expression: "sin(x)+x**2",
    xRange: [-3, 3],
  });
  assert.equal(titles.thumbnailConcepts?.[0].headline, "Slope is height");
});

test("the strongest rendered title-thumbnail pair is published together", () => {
  const titles = parseVideoTitleSet(
    '["What Even Is a Tensor? Visualized From 0D to 3D", "Why Tensors Actually Change Shape Between Coordinates", "How Tensors Describe the World Without Breaking Physics"]',
  );
  assert.equal(
    selectThumbnailPair(titles, [
      { title: titles.candidates[1], thumbnailUrl: "second.png" },
      { title: titles.selected, thumbnailUrl: "selected.png" },
    ])?.thumbnailUrl,
    "selected.png",
  );
  assert.deepEqual(
    selectThumbnailPair(titles, [
      { title: titles.candidates[2], thumbnailUrl: "third.png" },
      { title: titles.candidates[1], thumbnailUrl: "second.png" },
    ]),
    { title: titles.candidates[1], thumbnailUrl: "second.png" },
  );
  assert.equal(
    selectThumbnailPair(titles, [
      { title: "Unrelated", thumbnailUrl: "x.png" },
    ]),
    undefined,
  );
});

test("thumbnail LaTeX and headlines accept math but reject TeX injection", () => {
  assert.equal(
    sanitizeThumbnailLatex("\\frac{d}{dx}e^x=e^x"),
    "\\frac{d}{dx}e^x=e^x",
  );
  assert.equal(sanitizeThumbnailLatex("\\input{/etc/passwd}"), "");
  assert.equal(sanitizeThumbnailLatex("\\immediate\\write18{id}"), "");
  assert.equal(sanitizeThumbnailLatex("x^{2"), "");
  assert.equal(sanitizeThumbnailLatex("^^5cinput"), "");
  assert.equal(
    sanitizeThumbnailHeadline("Multiplying by $i$ is a quarter turn"),
    "Multiplying by $i$ is a quarter turn",
  );
  assert.equal(sanitizeThumbnailHeadline("Unclosed $math"), "");
  assert.equal(sanitizeThumbnailHeadline("Sneaky \\input{x} copy"), "");
  assert.equal(
    sanitizeThumbnailHeadline(
      "This headline is far too long for two short lines",
    ),
    "",
  );
  assert.equal(
    sanitizeThumbnailSurfaceExpression("sin(x)*cos(y)"),
    "sin(x)*cos(y)",
  );
  assert.equal(sanitizeThumbnailSurfaceExpression("__import__('os')"), "");
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
