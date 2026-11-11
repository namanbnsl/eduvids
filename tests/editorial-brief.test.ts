import { test } from "node:test";
import assert from "node:assert/strict";
import examples from "./fixtures/editorial-briefs.json";
import {
  editorialBriefContext,
  EditorialBriefReviewError,
  parseEditorialBrief,
  parseEditorialReview,
  type EditorialBrief,
  type EditorialReview,
} from "../src/lib/editorial-brief";
import {
  EDITORIAL_BRIEF_ARTIFACT,
  prepareEditorialBrief,
} from "../src/lib/workflow/editorial-brief";

const accepted: EditorialReview = {
  decision: "accept",
  summary:
    "The brief connects the visible motion to a useful prediction with appropriate limits.",
  issues: [],
};
const revision: EditorialReview = {
  decision: "revise",
  summary: "The mechanism needs a condition rather than a universal claim.",
  issues: [
    {
      field: "assumptions",
      issue: "The illustrated configuration is not qualified.",
      revision: "State the geometry and small-tilt conditions explicitly.",
    },
  ],
};

function harness(options: { drafts?: unknown[]; reviews?: unknown[] } = {}) {
  const store = new Map<string, string>();
  const steps = new Map<string, unknown>();
  const calls = {
    draft: 0,
    review: 0,
    feedback: [] as string[],
    reviewed: [] as EditorialBrief[],
  };
  const deps = {
    prompt: "Explain why the weighted toy returns upright.",
    variant: "short" as const,
    runStep: async <T>(name: string, work: () => Promise<T>): Promise<T> => {
      if (steps.has(name)) return steps.get(name) as T;
      const value = await work();
      steps.set(name, value);
      return value;
    },
    read: async (key: string) => store.get(key),
    write: async (key: string, value: string) => {
      store.set(key, value);
    },
    draft: async (feedback: string) => {
      calls.feedback.push(feedback);
      return (options.drafts ?? [examples.physical])[calls.draft++];
    },
    review: async (brief: EditorialBrief) => {
      calls.reviewed.push(brief);
      return (options.reviews ?? [accepted])[calls.review++];
    },
  };
  return { store, steps, calls, deps };
}

test("brief schema supports physical and mathematical explanatory value without requiring an object", () => {
  for (const brief of Object.values(examples))
    assert.deepEqual(parseEditorialBrief(JSON.stringify(brief)), brief);
  assert.throws(() =>
    parseEditorialBrief({ ...examples.physical, missingInsight: " " }),
  );
  assert.throws(() =>
    parseEditorialBrief({ ...examples.physical, causalSteps: [] }),
  );
  assert.throws(() =>
    parseEditorialBrief({
      ...examples.physical,
      transferTest: { question: "What changes?" },
    }),
  );
  assert.throws(() =>
    parseEditorialBrief(JSON.stringify(examples.physical).slice(0, -10)),
  );
});

test("a review cannot accept unresolved issues or silently default an omitted verdict", () => {
  assert.throws(() =>
    parseEditorialReview({ ...revision, decision: "accept" }),
  );
  assert.throws(() =>
    parseEditorialReview({ ...accepted, decision: "revise" }),
  );
  assert.throws(() =>
    parseEditorialReview({ summary: "Looks good to me.", issues: [] }),
  );
  assert.deepEqual(parseEditorialReview(accepted), accepted);
});

test("accepted brief and its review are persisted before downstream narration can proceed", async () => {
  const h = harness();
  const brief = await prepareEditorialBrief(h.deps);
  const record = JSON.parse(h.store.get(EDITORIAL_BRIEF_ARTIFACT)!);
  assert.deepEqual(brief, examples.physical);
  assert.deepEqual(record.brief, brief);
  assert.deepEqual(record.review, accepted);
  assert.equal(record.version, 1);
  assert.equal(h.calls.draft, 1);
  assert.equal(h.calls.review, 1);
});

test("one revision receives specific feedback and the revised brief is reviewed separately", async () => {
  const revised = {
    ...examples.physical,
    assumptions: [
      ...examples.physical.assumptions,
      "Only the illustrated small tilts are considered.",
    ],
  };
  const h = harness({
    drafts: [examples.physical, revised],
    reviews: [revision, accepted],
  });
  const brief = await prepareEditorialBrief(h.deps);
  assert.deepEqual(brief, revised);
  assert.match(h.calls.feedback[1]!, /small-tilt conditions/);
  assert.deepEqual(h.calls.reviewed, [examples.physical, revised]);
  assert.equal(
    JSON.parse(h.store.get("editorialReviewV1-0")!).decision,
    "revise",
  );
  assert.equal(h.calls.draft, 2);
});

test("a rejected premise stops before downstream work, without a new topic or fallback", async () => {
  const rejected = { ...revision, decision: "reject" };
  const h = harness({ reviews: [rejected] });
  let downstreamCalls = 0;
  await assert.rejects(async () => {
    await prepareEditorialBrief(h.deps);
    downstreamCalls++;
  }, EditorialBriefReviewError);
  assert.equal(downstreamCalls, 0);
  assert.equal(h.calls.draft, 1);
  assert.equal(h.calls.review, 1);
  assert.equal(h.store.has(EDITORIAL_BRIEF_ARTIFACT), false);
});

test("revision exhaustion holds instead of continuing with a weak brief", async () => {
  const h = harness({
    drafts: [examples.physical, examples.physical],
    reviews: [revision, revision],
  });
  await assert.rejects(
    prepareEditorialBrief(h.deps),
    EditorialBriefReviewError,
  );
  assert.equal(h.calls.draft, 2);
  assert.equal(h.calls.review, 2);
  assert.equal(h.store.has(EDITORIAL_BRIEF_ARTIFACT), false);
});

test("malformed draft or review never becomes an accepted brief", async () => {
  for (const options of [
    { drafts: ['{"viewerQuestion":', {}] },
    {
      drafts: [examples.physical, examples.physical],
      reviews: [{ ...accepted, issues: revision.issues }, "not JSON"],
    },
  ]) {
    const h = harness(options);
    await assert.rejects(
      prepareEditorialBrief(h.deps),
      EditorialBriefReviewError,
    );
    assert.equal(h.store.has(EDITORIAL_BRIEF_ARTIFACT), false);
    assert.equal(h.calls.draft, 2);
  }
});

test("durable replay and accepted-cache reuse do not repeat model calls", async () => {
  const h = harness();
  await prepareEditorialBrief(h.deps);
  await prepareEditorialBrief(h.deps); // Replay using cached step results.
  assert.equal(h.calls.draft, 1);
  assert.equal(h.calls.review, 1);
  h.steps.clear(); // Fresh invocation can reuse the accepted artifact.
  await prepareEditorialBrief(h.deps);
  assert.equal(h.calls.draft, 1);
  assert.equal(h.calls.review, 1);
  h.steps.clear();
  await assert.rejects(
    prepareEditorialBrief({
      ...h.deps,
      prompt: "A different concept entirely.",
    }),
    /does not match/,
  );
});

test("cached rejected records cannot bypass editorial review", async () => {
  const h = harness();
  await prepareEditorialBrief(h.deps);
  const record = JSON.parse(h.store.get(EDITORIAL_BRIEF_ARTIFACT)!);
  h.store.set(
    EDITORIAL_BRIEF_ARTIFACT,
    JSON.stringify({ ...record, review: revision }),
  );
  h.steps.clear();
  await assert.rejects(prepareEditorialBrief(h.deps), /lacks acceptance/);
});

test("provider errors remain transport failures, not editorial rejections or approval", async () => {
  const h = harness();
  const unavailable = new Error("503 provider overloaded");
  h.deps.draft = async () => {
    throw unavailable;
  };
  await assert.rejects(prepareEditorialBrief(h.deps), unavailable);
  assert.equal(h.calls.review, 0);
  assert.equal(h.store.has(EDITORIAL_BRIEF_ARTIFACT), false);
});

test("acceptance persistence must succeed before returning a usable brief", async () => {
  const h = harness();
  const write = h.deps.write;
  h.deps.write = async (key, value) => {
    if (key === EDITORIAL_BRIEF_ARTIFACT)
      throw new Error("Storage unavailable");
    await write(key, value);
  };
  await assert.rejects(prepareEditorialBrief(h.deps), /Storage unavailable/);
  assert.equal(h.store.has(EDITORIAL_BRIEF_ARTIFACT), false);
  h.deps.write = write;
  assert.deepEqual(await prepareEditorialBrief(h.deps), examples.physical);
  assert.equal(h.calls.draft, 1);
  assert.equal(h.calls.review, 1);
});

test("an accepted brief for a different format cannot be reused", async () => {
  const h = harness();
  await prepareEditorialBrief(h.deps);
  h.steps.clear();
  await assert.rejects(
    prepareEditorialBrief({ ...h.deps, variant: "video" }),
    /does not match/,
  );
});

test("already-narrated pre-rollout jobs resume without an invented retrospective brief", async () => {
  const h = harness();
  h.store.set("voiceoverScript", "Existing narration from before rollout.");
  assert.equal(await prepareEditorialBrief(h.deps), undefined);
  assert.equal(h.calls.draft, 0);
  assert.equal(h.calls.review, 0);
});

test("accepted context carries the causal plan without presenting acceptance as verification", () => {
  const context = editorialBriefContext(parseEditorialBrief(examples.maths));
  assert.match(context, /zero difference/);
  assert.match(context, /not factual verification/);
  assert.match(context, /not narration to read verbatim/);
  assert.equal(editorialBriefContext(), "");
});
