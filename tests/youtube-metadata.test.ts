import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseVideoDescriptionPackage,
  fallbackVideoTitle,
  generateValidatedMetadata,
  formatChapterTimestamp,
  buildChapters,
  buildPreviousVideoComment,
  buildYouTubeDescription,
  DESCRIPTION_CTA,
  withDescriptionCta,
  parseVideoTitleSet,
  sanitizeThumbnailCallout,
  sanitizeThumbnailHeadline,
  sanitizeThumbnailLatex,
  sanitizeThumbnailNumber,
  sanitizeThumbnailPlotExpression,
  sanitizeThumbnailStrike,
  sanitizeThumbnailSurfaceExpression,
  sanitizeThumbnailVisual,
  selectThumbnailPair,
  THUMBNAIL_COPY_LAYOUTS,
  type RelatedYouTubeVideo,
} from "../src/lib/youtube-metadata";
import { protectLatexBackslashes } from "../src/lib/latex-json";
import { buildThumbnailSpecs, inferVisual } from "../src/lib/youtube-thumbnail";

test("production briefs never become fallback titles or description copy", () => {
  const prompt =
    "An educational horizontal video explaining nuclear fission for beginners. Scene 1: visual of an atom";
  assert.equal(fallbackVideoTitle(prompt), "Nuclear fission for beginners");
  assert.equal(
    fallbackVideoTitle(
      "A horizontal educational video explaining why water (H2O) is a bent molecule using VSEPR theory. Scene 1: show bonds",
    ),
    "Why water (H2O) is a bent molecule using VSEPR theory",
  );
  assert.equal(fallbackVideoTitle(""), "A Visual Math and Science Exploration");
  assert.ok(fallbackVideoTitle("a ".repeat(100)).length <= 80);
  assert.doesNotMatch(
    buildYouTubeDescription({ topic: prompt }),
    /educational horizontal|Scene 1|hidden pattern/,
  );
  assert.throws(
    () =>
      parseVideoTitleSet(
        JSON.stringify([
          prompt.slice(0, 70),
          "Why a Single Neutron Can Start a Chain Reaction",
          "The Energy Hidden Inside an Atomic Nucleus",
        ]),
      ),
    /three usable candidates/,
  );
});

test("invalid metadata gets one repair attempt with validation feedback", async () => {
  const feedback: string[] = [];
  const valid = JSON.stringify({
    hook: [
      "One neutron can split a nucleus.",
      "See how nuclear fission releases energy and starts a chain reaction.",
    ],
  });
  const result = await generateValidatedMetadata(async (message) => {
    feedback.push(message);
    return feedback.length === 1 ? '{"hook": []}' : valid;
  }, parseVideoDescriptionPackage);
  assert.match(result.hook, /nuclear fission/);
  assert.equal(feedback.length, 2);
  assert.match(feedback[1]!, /two concise/);
  let attempts = 0;
  await assert.rejects(
    generateValidatedMetadata(async () => {
      attempts++;
      throw new Error("provider unavailable");
    }, parseVideoDescriptionPackage),
    /provider unavailable/,
  );
  assert.equal(attempts, 2);
});

test("metadata attempts share one deadline and stop when it expires", async (t) => {
  for (const expireOnAttempt of [1, 2]) {
    const controller = new AbortController();
    const deadline = new Error("metadata deadline exceeded");
    const timeout = t.mock.method(
      AbortSignal,
      "timeout",
      (milliseconds: number) => {
        assert.equal(milliseconds, 240_000);
        return controller.signal;
      },
    );
    let attempts = 0;
    try {
      await assert.rejects(
        generateValidatedMetadata(async (_feedback, abortSignal) => {
          attempts++;
          assert.equal(abortSignal, controller.signal);
          if (attempts === expireOnAttempt) {
            // Model requests listen to this shared signal. Simulate the
            // deadline cancelling the active request, including a repair.
            return new Promise<string>((_resolve, reject) => {
              abortSignal.addEventListener(
                "abort",
                () => reject(abortSignal.reason),
                { once: true },
              );
              controller.abort(deadline);
            });
          }
          return '{"hook": []}';
        }, parseVideoDescriptionPackage),
        (error) => error === deadline,
      );
      assert.equal(attempts, expireOnAttempt);
      assert.equal(timeout.mock.callCount(), 1);
    } finally {
      timeout.mock.restore();
    }
  }
});

test("metadata returned after the deadline is not validated or retried", async (t) => {
  const controller = new AbortController();
  t.mock.method(AbortSignal, "timeout", () => controller.signal);
  let validations = 0;
  let attempts = 0;
  await assert.rejects(
    generateValidatedMetadata(
      async () => {
        attempts++;
        controller.abort(new Error("metadata deadline exceeded"));
        return "late response";
      },
      () => {
        validations++;
      },
    ),
    /metadata deadline exceeded/,
  );
  assert.equal(validations, 0);
  assert.equal(attempts, 1);
});

test("fallback titles preserve topic words that start with a production prefix", () => {
  for (const topic of [
    "One neutron can start a chain reaction",
    "Only one neutron is needed",
    "Often the simplest answer is wrong",
    "Animation changes how we see numbers",
    "Shortcuts through spacetime",
  ]) {
    assert.equal(fallbackVideoTitle(topic), topic);
    assert.ok(buildYouTubeDescription({ topic }).startsWith(`${topic}\n`));
    assert.equal(fallbackVideoTitle(`A video on ${topic}`), topic);
  }
});

test("empty, malformed and overlong descriptions trigger repair instead of leaking JSON", () => {
  for (const raw of [
    '{"hook": []}',
    '{"tags": ["physics"]}',
    '{"hook":',
    "",
    JSON.stringify({ hook: ["x".repeat(111), "Second line."] }),
    JSON.stringify({ hook: ["Scene 1: draw an atom", "Narrate the split."] }),
  ]) {
    assert.throws(
      () => parseVideoDescriptionPackage(raw),
      /Description generation/,
    );
  }
});

test("thumbnail compositions vary across videos and preserve a text-free B", () => {
  const titles = parseVideoTitleSet(
    JSON.stringify(
      [0, 1, 2].map((i) => ({
        title: `The Energy Hidden in a Nucleus, Angle ${i + 1}`,
        headline: "Split one atom",
        accent: "Split",
        visual: { type: "fission" },
      })),
    ),
  );
  const layouts = new Set<string>();
  for (let job = 0; job < 30; job++) {
    const request = {
      titles,
      topic: "Nuclear fission",
      designSeed: `job-${job}`,
    };
    const specs = buildThumbnailSpecs(request);
    assert.deepEqual(specs, buildThumbnailSpecs(request));
    assert.notEqual(specs[0].layout, specs[2].layout);
    assert.equal(specs[1].layout, "visual_only");
    assert.equal(specs[1].headline, "");
    layouts.add(specs[0].layout);
  }
  assert.deepEqual([...layouts].sort(), [...THUMBNAIL_COPY_LAYOUTS].sort());
});

test("the model picks each thumbnail's template and its options", () => {
  const titles = parseVideoTitleSet(
    JSON.stringify({
      packages: [0, 1, 2].map((i) => ({
        title: `The Energy Hidden in a Nucleus, Angle ${i + 1}`,
        headline: "Split one atom",
        accent: "Split",
        visual: { type: "fission" },
        composition: [
          { layout: "statement", mark: "underline", size: "giant" },
          { layout: "visual_bleed", align: "center", heroScale: "fill" },
          { layout: "statement", align: "sideways", copyAt: "bottom" },
        ][i],
      })),
    }),
  );
  const specs = buildThumbnailSpecs({
    titles,
    topic: "Nuclear fission",
    designSeed: "job",
  });
  assert.equal(specs[0].layout, "statement");
  assert.deepEqual(specs[0].composition, { size: "giant", mark: "underline" });
  // B is text-free: only visual options survive.
  assert.equal(specs[1].layout, "visual_bleed");
  assert.deepEqual(specs[1].composition, { heroScale: "fill" });
  // C may not repeat A's template; invalid options are dropped.
  assert.notEqual(specs[2].layout, "statement");
  assert.deepEqual(specs[2].composition, { copyAt: "bottom" });
  assert.equal(sanitizeThumbnailNumber("+38 µs"), "+38 µs");
});

test("topic-specific visuals distinguish fission, molecular bonds and internet traffic", () => {
  assert.deepEqual(inferVisual("nuclear fission"), { type: "fission" });
  assert.deepEqual(inferVisual("Why water is a bent molecule"), {
    type: "molecule",
    shape: "water",
  });
  assert.deepEqual(inferVisual("carbon dioxide bonds"), {
    type: "molecule",
    shape: "carbon_dioxide",
  });
  assert.deepEqual(inferVisual("Why movies choke a network"), {
    type: "packet_flow",
  });
  assert.deepEqual(sanitizeThumbnailVisual("molecule", { shape: "ammonia" }), {
    type: "molecule",
  });
});

const previousVideo: RelatedYouTubeVideo = {
  videoId: "previous123",
  title: "Why Differentiation Actually Works",
  watchUrl: "https://www.youtube.com/watch?v=previous123",
};

test("thumbnail concepts support energy transitions and overlapping sets", () => {
  assert.deepEqual(
    sanitizeThumbnailVisual("energy_levels", { notation: "wrong legend" }),
    {
      type: "energy_levels",
    },
  );
  assert.deepEqual(sanitizeThumbnailVisual("geometry", { shape: "venn" }), {
    type: "geometry",
    shape: "venn",
  });
});

test("brainstormed packages keep strike and callout copy, except on slot B", () => {
  const titles = parseVideoTitleSet(
    JSON.stringify({
      ideas: ["Monty Hall Is Not 50/50", "Always Switch Doors", "Why Switch"],
      packages: [
        {
          title: "Why Your Gut Gets the Monty Hall Problem Wrong",
          eyebrow: "Probability",
          headline: "Not 50% but 67%",
          accent: "67%",
          strike: "50%",
          callout: "switch",
          visualConcept: "a giant 67% over a struck 50%",
          visual: { type: "number", value: "67%", was: "50%" },
        },
        {
          title: "How the Monty Hall Problem Actually Works",
          headline: "Ignored",
          strike: "Ignored",
          callout: "dropped",
          visual: {
            type: "bars",
            values: [33.3, 66.7],
            focus: 1,
            labels: ["stay", "switch"],
          },
        },
        {
          title: "The Game Show Puzzle That Fooled Mathematicians",
          headline: "Stay or switch?",
          accent: "switch",
          strike: "switch",
          callout: "far too long for a callout",
          visual: { type: "spiral", shape: "primes", rogue: 1 },
        },
      ],
    }),
  );
  const [first, second, third] = titles.thumbnailConcepts!;
  assert.equal(
    titles.selected,
    "Why Your Gut Gets the Monty Hall Problem Wrong",
  );
  assert.equal(first.strike, "50%");
  assert.equal(first.callout, "switch");
  assert.deepEqual(first.visual, { type: "number", value: "67%", was: "50%" });
  assert.equal(second.headline, "");
  assert.equal(second.strike, undefined);
  assert.equal(second.callout, undefined);
  assert.deepEqual(second.visual, {
    type: "bars",
    values: [33.3, 66.7],
    focus: 1,
    labels: ["stay", "switch"],
  });
  // The accent can't also be the crossed-out word.
  assert.equal(third.strike, undefined);
  assert.equal(third.callout, undefined);
  assert.deepEqual(third.visual, { type: "spiral", shape: "primes" });
});

test("LaTeX written with one backslash survives the JSON parse", () => {
  // The model writes "$\infty$" with a single backslash: invalid JSON that
  // jsonrepair used to turn into "$infty$" (italic letters on the thumbnail).
  const raw = String.raw`{"packages": [{
    "title": "The Butterfly That Never Repeats",
    "headline": "Never $\theta$ twice",
    "callout": "$\infty$ loop",
    "visual": {"type": "chaos", "shape": "lorenz"}
  }, {
    "title": "Chaos in Three Equations",
    "visual": {"type": "chaos", "shape": "lorenz"}
  }, {
    "title": "Why Weather Forecasts Always Break",
    "headline": "$\frac{dx}{dt}$ decides",
    "visual": {"type": "chaos", "shape": "lorenz"}
  }]}`;
  // Slot B is visual-only, so its copy is not checked.
  const [first, , third] = parseVideoTitleSet(raw).thumbnailConcepts!;
  assert.equal(first.callout, String.raw`$\infty$ loop`);
  assert.equal(first.headline, String.raw`Never $\theta$ twice`);
  assert.equal(third.headline, String.raw`$\frac{dx}{dt}$ decides`);
  // A real newline escape is left alone.
  assert.equal(protectLatexBackslashes(String.raw`"a\nb"`), String.raw`"a\nb"`);
  assert.equal(
    protectLatexBackslashes(String.raw`"\\infty"`),
    String.raw`"\\infty"`,
  );
  // Doubled in the decoded copy, it is a TeX line break: collapse it.
  assert.equal(sanitizeThumbnailLatex(String.raw`\\infty`), String.raw`\infty`);
  assert.equal(sanitizeThumbnailLatex("\theta"), ""); // a tab, then "heta"
});

test("click-through copy and figures reject TeX and partial words", () => {
  assert.equal(sanitizeThumbnailCallout("Why $0$?"), "Why $0$?");
  assert.equal(sanitizeThumbnailCallout("\\input{x}"), "");
  assert.equal(sanitizeThumbnailCallout("one two three four"), "");
  assert.equal(
    sanitizeThumbnailStrike("Height", "Height Area is chance", "Area"),
    "Height",
  );
  assert.equal(
    sanitizeThumbnailStrike("Heigh", "Height Area is chance", "Area"),
    "",
  );
  assert.equal(
    sanitizeThumbnailStrike("Area", "Height Area is chance", "Area"),
    "",
  );
  assert.equal(sanitizeThumbnailStrike("two words", "two words here", ""), "");
  assert.equal(sanitizeThumbnailNumber("0.999…"), "");
  assert.equal(sanitizeThumbnailNumber("1/3"), "1/3");
  assert.equal(sanitizeThumbnailNumber("67%"), "67%");
  assert.equal(sanitizeThumbnailNumber("os.system"), "");
  assert.equal(sanitizeThumbnailHeadline("Not 99% sure"), "Not 99% sure");
  assert.deepEqual(
    sanitizeThumbnailVisual("bars", {
      values: [1, -2],
      focus: 4,
      labels: ["a", "b"],
    }),
    { type: "bars" },
  );
});

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
  // Slot B is the visual-only variant: copy is dropped, the visual is kept.
  assert.equal(second.headline, "");
  assert.equal(second.accent, "");
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
  assert.match(result, /https:\/\/github\.com\/namanbnsl\/eduvids/);
});

test("previous-video comment has one focused CTA", () => {
  assert.equal(
    buildPreviousVideoComment(previousVideo),
    "Previous: Why Differentiation Actually Works → https://www.youtube.com/watch?v=previous123",
  );
});

test("a math token can be the accent of a headline variant", () => {
  const titles = parseVideoTitleSet(
    JSON.stringify(
      [
        "Why Multiplying by i Is a Quarter Turn",
        "What Imaginary Numbers Actually Do",
        "Every Rotation Is Secretly Multiplication",
      ].map((title) => ({
        title,
        headline: "Same arrow, two $\\vec v$",
        accent: "$\\vec v$",
        visual: { type: "complex_plane" },
      })),
    ),
  );
  assert.equal(titles.thumbnailConcepts?.[0].accent, "$\\vec v$");
  assert.equal(titles.thumbnailConcepts?.[1].headline, "");
  assert.equal(titles.thumbnailConcepts?.[2].accent, "$\\vec v$");
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

test("old descriptions get the current call to action", () => {
  assert.equal(
    withDescriptionCta(
      "Hook.\n\nMake your own visual explanation at https://eduvids.app\n\n#Math #Calculus",
    ),
    `Hook.\n\n${DESCRIPTION_CTA}\n\n#Math #Calculus`,
  );
  assert.equal(
    withDescriptionCta("Hook.\n\n#Math #Calculus"),
    `Hook.\n\n${DESCRIPTION_CTA}\n\n#Math #Calculus`,
  );
  assert.equal(withDescriptionCta("Hook."), `Hook.\n\n${DESCRIPTION_CTA}`);
  assert.equal(withDescriptionCta(`Hook.\n\n${DESCRIPTION_CTA}`), null);
  assert.equal(withDescriptionCta(""), DESCRIPTION_CTA);
});
