import { test } from "node:test";
import assert from "node:assert/strict";
import { withOverloadFallback } from "../src/lib/workflow/model-fallback";
import { generationFailureMessage } from "../src/lib/workflow/errors";

const overloaded = new Error("This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.");

test("overload switches models once and returns the fallback result", async () => {
  let calls = 0;
  const result = await withOverloadFallback(
    async () => { throw overloaded; },
    async () => { calls++; return "complete scene plan"; },
    new AbortController().signal,
  );
  assert.equal(result, "complete scene plan");
  assert.equal(calls, 1);
});

test("success, credential failures and malformed output never trigger fallback", async () => {
  let calls = 0;
  const fallback = async () => { calls++; return "unexpected"; };
  const signal = new AbortController().signal;
  assert.equal(await withOverloadFallback(async () => "ok", fallback, signal), "ok");
  for (const message of ["Permission denied: consumer suspended", "Invalid JSON", "429 quota exceeded"]) {
    const error = new Error(message);
    await assert.rejects(withOverloadFallback(async () => { throw error; }, fallback, signal), error);
  }
  assert.equal(calls, 0);
});

test("an exhausted deadline prevents fallback even when the primary reports overload", async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(withOverloadFallback(
    async () => { controller.abort(); throw overloaded; },
    async () => { calls++; return "unexpected"; },
    controller.signal,
  ), overloaded);
  assert.equal(calls, 0);
});

test("fallback failure propagates to durable workflow retries without looping", async () => {
  let calls = 0;
  await assert.rejects(withOverloadFallback(
    async () => { throw overloaded; },
    async () => { calls++; throw new Error("503 service unavailable"); },
    new AbortController().signal,
  ), /503/);
  assert.equal(calls, 1);
});

test("scene planning overload is not mislabeled as a script rendering error", () => {
  const message = generationFailureMessage(`[generateScenePlan] All 1 attempts failed. Last error: ${overloaded}`);
  assert.match(message, /temporarily overloaded/);
  assert.doesNotMatch(message, /script|repair/);
});
