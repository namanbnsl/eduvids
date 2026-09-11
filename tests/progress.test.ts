import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { jobStore, artifactStore } from "../src/lib/job-store";
import { GET } from "../src/app/api/jobs/[id]/events/route";
import type { VideoJob } from "../src/lib/types";

const job: VideoJob = {
  id: "test",
  description: "test",
  status: "ready",
  variant: "video",
  progress: 100,
  step: "completed",
  createdAt: "today",
  updatedAt: "today",
};

test("a terminal progress event closes the stream", async () => {
  const get = mock.method(jobStore, "get", async () => job);
  try {
    const response = await GET(new Request("https://example.test"), {
      params: Promise.resolve({ id: "test" }),
    });
    const body = await response.text();
    assert.match(body, /event: progress/);
    assert.match(body, /"status":"ready"/);
    assert.equal(get.mock.calls.length, 1);
  } finally {
    get.mock.restore();
  }
});

test("storage errors close progress streams so the client can reconnect", async () => {
  const get = mock.method(jobStore, "get", async () => {
    throw new Error("KV unavailable");
  });
  try {
    const response = await GET(new Request("https://example.test"), {
      params: Promise.resolve({ id: "test" }),
    });
    assert.equal(await response.text(), "retry: 3000\n\n");
  } finally {
    get.mock.restore();
  }
});

test("client disconnect closes an in-flight stream without enqueuing into a closed controller", async () => {
  let resolve!: (value: VideoJob) => void;
  const get = mock.method(
    jobStore,
    "get",
    () =>
      new Promise<VideoJob>((done) => {
        resolve = done;
      }),
  );
  try {
    const controller = new AbortController();
    const response = await GET(
      new Request("https://example.test", { signal: controller.signal }),
      { params: Promise.resolve({ id: "test" }) },
    );
    controller.abort();
    resolve(job);
    assert.equal(await response.text(), "retry: 3000\n\n");
  } finally {
    get.mock.restore();
  }
});

test("KV requester preserves SDK serialization, uses a deadline, and supports upload claims", async () => {
  const oldUrl = process.env.KV_REST_API_URL;
  const oldToken = process.env.KV_REST_API_TOKEN;
  process.env.KV_REST_API_URL = "https://kv.example.test";
  process.env.KV_REST_API_TOKEN = "fixture";
  const commands: unknown[][] = [];
  const fetch = mock.method(
    globalThis,
    "fetch",
    async (_input: string | URL | Request, init?: RequestInit) => {
      assert.ok(init?.signal);
      commands.push(JSON.parse(String(init?.body)));
      return Response.json({
        result: commands.length === 1 ? JSON.stringify(job) : "OK",
      });
    },
  );
  try {
    assert.deepEqual(await jobStore.get("test"), job);
    assert.equal(await artifactStore.claim("test", "upload"), true);
    assert.deepEqual(commands[0], ["get", "job:test"]);
    assert.ok(commands[1].includes("nx"));
  } finally {
    fetch.mock.restore();
    if (oldUrl === undefined) delete process.env.KV_REST_API_URL;
    else process.env.KV_REST_API_URL = oldUrl;
    if (oldToken === undefined) delete process.env.KV_REST_API_TOKEN;
    else process.env.KV_REST_API_TOKEN = oldToken;
  }
});
