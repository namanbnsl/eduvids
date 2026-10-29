import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertValidUploadTitle,
  chapterLanguageErrors,
  detectMetadataLanguage,
  repairYouTubeMetadata,
  titleValidationErrors,
  YouTubeMetadataReviewError,
} from "../src/lib/youtube-validation";
import {
  buildPreviousVideoComment,
  buildYouTubeDescription,
  parseVideoDescriptionPackage,
  parseVideoTitleSet,
} from "../src/lib/youtube-metadata";
import {
  selectPreviousYouTubeVideo,
  uploadToYouTube,
} from "../src/lib/youtube";

const badTitles = [
  'Title: "Why Honeycomb Panels Are So Stiff for Their Weight" (large on-screen',
  'Title slide: "Electrostatic Precipitator: How Electricity Pulls Dust Out of',
  'Title screen: "The Fountain With No Electric Pump" (large bold text)',
  'Title on screen: "The Tiny Machine That Makes Your Phone Feel Clicks"',
  "Titled 'How Chirp Radar Pulse Compression Resolves Close Objects'",
  "(~45 seconds) in three scenes illustrating water hammer",
  "(variant: video) that explains Braess's paradox with a simple animated road",
  "Detailed educational animation on shape-memory alloys focusing on nitinol at",
  "Animation teaching acid-base chemistry from first principles",
  "A Visual Math and Science Exploration",
];
const goodTitles = [
  "Why 90% of a Glass Lens Is Useless",
  "Why Some Gears Refuse to Turn Backward",
  "Why a Falling Magnet Floats Inside a Copper Tube",
  "The Energy Hidden in a Nucleus",
];

test("every reported prompt/storyboard/fallback title is rejected", () => {
  for (const title of badTitles)
    assert.notEqual(titleValidationErrors(title).length, 0, title);
  for (const title of goodTitles)
    assert.deepEqual(titleValidationErrors(title), [], title);
});

test("title rules apply separately, including unclosed quotes, durations and dangling words", () => {
  for (const title of [
    "Scene 2: A Falling Magnet",
    "Title on screen A Falling Magnet",
    '"Why Magnets Fall Slowly',
    "Why Magnets Fall Slowly”",
    "Why Magnets Fall Slowly (Copper)",
    "The Magnet Variant",
    "A Slow Scene in a Copper Tube",
    "The First 45 Seconds",
    "~45 Reasons Magnets Fall",
    "A Video That Explains Falling Magnets",
    "Educational Magnets",
    "Video About Copper",
    "Why Magnets Fall at",
    "Why Magnets Fall of",
    "Why Magnets Fall the",
    "Why Magnets Fall and",
    "Why Magnets Fall with",
    "Why Magnets Fall…",
    "A".repeat(101),
  ])
    assert.notEqual(titleValidationErrors(title).length, 0, title);
  assert.deepEqual(titleValidationErrors("A".repeat(100)), []);
  assert.match(
    titleValidationErrors(goodTitles[0]!, [goodTitles[0]!]).join(),
    /already exists/,
  );
  assert.match(
    titleValidationErrors(` ${goodTitles[0]!.toLowerCase()} `, [
      goodTitles[0]!,
    ]).join(),
    /already exists/,
  );
});

test("title packages cannot clean away wrapping quotes to pass validation", () => {
  assert.throws(
    () =>
      parseVideoTitleSet(
        JSON.stringify([`"${goodTitles[0]}"`, goodTitles[1], goodTitles[2]]),
      ),
    /three usable/,
  );
});

test("a missing title or rejected title regenerates independently and uses validation feedback", async () => {
  const feedback: string[] = [];
  const existing = [goodTitles[0]!];
  const result = await repairYouTubeMetadata(
    badTitles[0]!,
    (candidate) => assertValidUploadTitle(candidate, existing),
    async (reason) => {
      feedback.push(reason);
      return feedback.length === 1 ? existing[0]! : goodTitles[1]!;
    },
  );
  assert.equal(result, goodTitles[1]);
  assert.match(feedback[0]!, /production label/);
  assert.match(feedback[1]!, /already exists/);
  assert.equal(
    await repairYouTubeMetadata(
      "",
      assertValidUploadTitle,
      async () => goodTitles[0]!,
    ),
    goodTitles[0],
  );
  assert.equal(
    await repairYouTubeMetadata(
      goodTitles[0]!,
      assertValidUploadTitle,
      async () => {
        throw new Error("must not generate");
      },
    ),
    goodTitles[0],
  );
});

test("three rejected repairs require review; no title is sliced or replaced by a fallback", async () => {
  let attempts = 0;
  await assert.rejects(
    repairYouTubeMetadata("", assertValidUploadTitle, async () => {
      attempts++;
      return "Why Magnets Fall ".repeat(10);
    }),
    (error) =>
      error instanceof YouTubeMetadataReviewError &&
      /100 characters/.test(error.message),
  );
  assert.equal(attempts, 3);
  attempts = 0;
  await assert.rejects(
    repairYouTubeMetadata("", assertValidUploadTitle, async () => {
      attempts++;
      throw new Error("provider unavailable");
    }),
    /needs review: provider unavailable/,
  );
  assert.equal(attempts, 3);
});

test("repair has one shared deadline and never accepts late metadata", async (t) => {
  const controller = new AbortController();
  const timeout = t.mock.method(AbortSignal, "timeout", (ms: number) => {
    assert.equal(ms, 180_000);
    return controller.signal;
  });
  let calls = 0;
  await assert.rejects(
    repairYouTubeMetadata(
      "",
      assertValidUploadTitle,
      async (_feedback, signal) => {
        calls++;
        assert.equal(signal, controller.signal);
        controller.abort(new Error("deadline exceeded"));
        return goodTitles[0]!;
      },
    ),
    /needs review: deadline exceeded/,
  );
  assert.equal(calls, 1);
  assert.equal(timeout.mock.callCount(), 1);
});

const englishTitle = goodTitles[2]!;
const chapters = (names: string[]) =>
  names.map((title, index) => ({ start: index * 26, title }));

test("Russian and Spanish chapters fail against an English title, even as a single mixed chapter", async () => {
  assert.equal(await detectMetadataLanguage(englishTitle), "en");
  for (const names of [
    ["Падение в двух трубах", "Вихревые токи", "Закон Ленца"],
    ["La caída en dos tubos", "Corrientes de Foucault", "El campo magnético"],
    ["The falling magnet", "Corrientes inducidas", "The copper tube"],
    ["The falling magnet", "Вихревые токи", "The copper tube"],
  ])
    assert.ok(
      (await chapterLanguageErrors(englishTitle, chapters(names))).length,
      names.join(),
    );
});

test("English chapters and short technical tokens do not cause false language mismatches", async () => {
  for (const names of [
    ["Falling in two tubes", "Eddy currents", "Magnetic braking"],
    ["The magnetic field", "The copper tube", "Lenz's law"],
    ["sp3", "pH", "Lenz’s law"],
    ["Pressure waves", "Metal remembers its shape", "Two tubes"],
    ["Changing flux", "Magnetic drag", "Proton transfer"],
    ["Neutralization", "Refraction", "Acid-base chemistry"],
    ["Curves that stretch", "Quick recap", "The final snap"],
  ])
    assert.deepEqual(
      await chapterLanguageErrors(englishTitle, chapters(names)),
      [],
      names.join(),
    );
  assert.deepEqual(await chapterLanguageErrors(englishTitle, []), []);
  assert.deepEqual(
    await chapterLanguageErrors(
      "Por qué un imán cae lentamente en un tubo de cobre",
      chapters([
        "La caída en dos tubos",
        "El campo magnético",
        "Corrientes inducidas",
      ]),
    ),
    [],
  );
});

test("chapter repair rechecks each name and keeps timestamps", async () => {
  const original = chapters([
    "Падение в двух трубах",
    "Вихревые токи",
    "Закон Ленца",
  ]);
  let calls = 0;
  const result = await repairYouTubeMetadata(
    original,
    async (candidate) => {
      const errors = await chapterLanguageErrors(englishTitle, candidate);
      if (errors.length) throw new Error(errors.join("; "));
      return candidate;
    },
    async () => {
      calls++;
      return original.map((chapter, index) => ({
        ...chapter,
        title: [
          "Falling in two tubes",
          calls === 1 ? "Вихревые токи" : "Eddy currents",
          "Lenz's law",
        ][index]!,
      }));
    },
  );
  assert.equal(calls, 2);
  assert.deepEqual(
    result.map((chapter) => chapter.start),
    original.map((chapter) => chapter.start),
  );
});

test("clipped, lowercase and extra description lines must regenerate", () => {
  for (const hook of [
    ["How can a closed loop of curves suddenly stretch", "snap"],
    [
      "not a single magnet or motor bends a slap bracelet.",
      "The steel changes its shape.",
    ],
    ["How can a closed loop stretch?", "The curve moves with"],
    ["First sentence.", "Second sentence.", "Discarded third sentence."],
  ])
    assert.throws(
      () => parseVideoDescriptionPackage(JSON.stringify({ hook })),
      /Description generation/,
    );
  const hook = [
    "Not a single magnet or motor bends a slap bracelet.",
    "The steel changes its shape when it snaps.",
  ];
  assert.equal(
    parseVideoDescriptionPackage(JSON.stringify({ hook })).hook,
    hook.join("\n"),
  );
  assert.equal(
    parseVideoDescriptionPackage(
      JSON.stringify({
        hook: [
          "90% of the lens does no work.",
          "The outer rings send light to the same focus.",
        ],
      }),
    ).hook.split("\n")[0],
    "90% of the lens does no work.",
  );
});

test("previous links and comments skip invalid or duplicate channel titles", () => {
  const videos = [
    badTitles[0]!,
    badTitles[9]!,
    goodTitles[0]!,
    goodTitles[0]!,
    goodTitles[1]!,
  ].map((title, index) => ({
    title,
    videoId: String(index),
    watchUrl: `https://youtu.be/${index}`,
    description: "",
  }));
  const previous = selectPreviousYouTubeVideo(videos);
  assert.equal(previous?.title, goodTitles[1]);
  assert.match(
    buildYouTubeDescription({
      salesCopy: "First sentence.\nSecond sentence.",
      previousVideo: previous,
    }),
    /Previous: Why Some Gears Refuse to Turn Backward/,
  );
  assert.throws(
    () => buildPreviousVideoComment(videos[0]!),
    /not passed validation/,
  );
  assert.throws(
    () => buildYouTubeDescription({ previousVideo: videos[0]! }),
    /not passed validation/,
  );
});

test("upload boundary refuses bad titles before contacting any external service", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("must not fetch");
  });
  for (const title of badTitles) {
    await assert.rejects(
      uploadToYouTube({ title, videoUrl: "https://example.com/video.mp4" }),
    );
  }
  assert.equal(fetchMock.mock.callCount(), 0);
});
