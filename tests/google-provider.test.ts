import { afterEach, before, mock, test } from "node:test";
import assert from "node:assert/strict";
import { ConvexError } from "convex/values";
import { generationFailureMessage } from "../src/lib/workflow/errors";

let createGoogleModel: typeof import("../src/lib/google-provider").createGoogleModel;
let reportSuccess: typeof import("../src/lib/google-provider").reportSuccess;
let client: ReturnType<
  typeof import("../src/lib/convex-server").getConvexClient
>;

before(async () => {
  // Capture a fake key pool before importing the provider; never call Google.
  const originalEnvironment = { ...process.env };
  try {
    for (const name of Object.keys(process.env)) {
      if (name.startsWith("GOOGLE_GENERATIVE_AI_API_KEY_"))
        delete process.env[name];
    }
    process.env.GOOGLE_GENERATIVE_AI_API_KEY_1 = "test-key";
    process.env.NEXT_PUBLIC_CONVEX_URL = "https://example.convex.cloud";
    ({ createGoogleModel, reportSuccess } =
      await import("../src/lib/google-provider"));
    const { getConvexClient } = await import("../src/lib/convex-server");
    client = getConvexClient();
  } finally {
    for (const name of Object.keys(process.env)) {
      if (!(name in originalEnvironment)) delete process.env[name];
    }
    Object.assign(process.env, originalEnvironment);
  }
});

afterEach(() => mock.restoreAll());

const primary = "gemini-3.8-flash";
const fallback = "gemini-3.5-flash-lite";
const unavailable = (model: string) =>
  new ConvexError(
    `No available API keys for google/${model}; retry after ~7865s.`,
  );

test("exhausted primary keys select the fallback before streaming and track its model", async () => {
  const calls: Array<Record<string, unknown>> = [];
  mock.method(
    client,
    "mutation",
    async (_fn: unknown, args: { model: string }) => {
      calls.push(args);
      if (args.model === primary) throw unavailable(primary);
      return { keyIndex: 0 };
    },
  );

  const selected = await createGoogleModel(primary);
  assert.equal(selected.modelId, fallback);
  assert.equal(selected.provider(selected.modelId).modelId, fallback);
  await reportSuccess(selected.provider);
  assert.deepEqual(calls, [
    { provider: "google", model: primary, numKeys: 1 },
    { provider: "google", model: fallback, numKeys: 1 },
    { provider: "google", model: fallback, keyIndex: 0 },
  ]);
});

test("available primary keys keep using the primary model", async () => {
  const mutation = mock.method(client, "mutation", async () => ({
    keyIndex: 0,
  }));
  const selected = await createGoogleModel(primary);
  assert.equal(selected.modelId, primary);
  assert.equal(mutation.mock.callCount(), 1);
});

test("blocked credentials and unknown database errors do not switch models", async () => {
  for (const error of [
    new ConvexError(
      `No available API keys for google/${primary}; all keys are blocked.`,
    ),
    new Error("[Request ID: test] Server Error"),
    new Error("fetch failed"),
  ]) {
    const mutation = mock.method(client, "mutation", async () => {
      throw error;
    });
    await assert.rejects(
      createGoogleModel(primary),
      error instanceof ConvexError ? /all keys are blocked/ : error,
    );
    assert.equal(mutation.mock.callCount(), 1);
    mutation.mock.restore();
  }
});

test("when both pools are exhausted, the fallback error propagates without looping", async () => {
  const models: string[] = [];
  mock.method(
    client,
    "mutation",
    async (_fn: unknown, args: { model: string }) => {
      models.push(args.model);
      throw unavailable(args.model);
    },
  );
  await assert.rejects(createGoogleModel(primary), /gemini-3\.5-flash-lite/);
  assert.deepEqual(models, [primary, fallback]);
  models.length = 0;
  await assert.rejects(createGoogleModel(fallback), /gemini-3\.5-flash-lite/);
  assert.deepEqual(models, [fallback]);
});

test("exhausted keys produce a useful workflow failure message", () => {
  assert.match(
    generationFailureMessage(unavailable(fallback).data),
    /keys have reached their limits/,
  );
  assert.match(
    generationFailureMessage(
      `No available API keys for google/${primary}; all keys are blocked.`,
    ),
    /rejected its credentials/,
  );
});
