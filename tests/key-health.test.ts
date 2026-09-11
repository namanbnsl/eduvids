import { test } from "node:test";
import assert from "node:assert/strict";
import { selectKey, reportError } from "../convex/apiKeys";
import type { MutationCtx } from "../convex/_generated/server";

type Row = Record<string, unknown> & { _id: string };
function database(initial: Row[]) {
  const tables: Record<string, Row[]> = {
    apiKeys: initial,
    apiKeyManagerState: [],
  };
  const db = {
    query: (table: string) => {
      const filters: Array<[string, unknown]> = [];
      const chain = {
        withIndex: (
          _: string,
          build: (q: {
            eq: (key: string, value: unknown) => unknown;
          }) => unknown,
        ) => {
          const q = {
            eq: (key: string, value: unknown) => {
              filters.push([key, value]);
              return q;
            },
          };
          build(q);
          return chain;
        },
        collect: async () =>
          tables[table]
            .filter((row) =>
              filters.every(([key, value]) => row[key] === value),
            )
            .map((row) => ({ ...row })),
        first: async () => (await chain.collect())[0] ?? null,
      };
      return chain;
    },
    insert: async (table: string, value: Record<string, unknown>) => {
      const _id = `${table}-${tables[table].length}`;
      tables[table].push({ _id, ...value });
      return _id;
    },
    get: async (id: string) =>
      Object.values(tables)
        .flat()
        .find((row) => row._id === id),
    patch: async (id: string, updates: Record<string, unknown>) =>
      Object.assign(
        Object.values(tables)
          .flat()
          .find((row) => row._id === id)!,
        updates,
      ),
  };
  return { ctx: { db } as unknown as MutationCtx, tables };
}
function key(
  index: number,
  model: string,
  extra: Record<string, unknown> = {},
): Row {
  return {
    _id: `${model}-${index}`,
    provider: "google",
    model,
    keyIndex: index,
    status: "healthy",
    windowStartMs: Date.now(),
    requestCount24h: 0,
    successCount: 0,
    errorCount: 0,
    consecutiveErrors: 0,
    updatedAtMs: Date.now(),
    ...extra,
  };
}
// Run the actual mutation handlers against an isolated database double.
const select = (
  selectKey as typeof selectKey & {
    _handler: (
      ctx: MutationCtx,
      args: { provider: string; model: string; numKeys: number },
    ) => Promise<{ keyIndex: number }>;
  }
)._handler;
const report = (
  reportError as typeof reportError & {
    _handler: (
      ctx: MutationCtx,
      args: {
        provider: string;
        model: string;
        keyIndex: number;
        errorMessage: string;
      },
    ) => Promise<void>;
  }
)._handler;

test("suspended credentials block every registered model and stay blocked beyond 15 minutes", async () => {
  const { ctx, tables } = database([
    key(0, "flash"),
    key(0, "lite"),
    key(1, "flash"),
  ]);
  await report(ctx, {
    provider: "google",
    model: "flash",
    keyIndex: 0,
    errorMessage:
      "Permission denied: Consumer api_key:AIzaTestSecret has been suspended.",
  });
  assert.equal(tables.apiKeys[0].status, "blocked");
  assert.equal(tables.apiKeys[1].status, "blocked");
  assert.doesNotMatch(String(tables.apiKeys[0].lastError), /AIzaTestSecret/);
  tables.apiKeys[0].lastErrorTimeMs = Date.now() - 3_600_000;
  assert.equal(
    (await select(ctx, { provider: "google", model: "flash", numKeys: 2 }))
      .keyIndex,
    1,
  );
  assert.equal(tables.apiKeys[0].status, "blocked");
});

test("repeated transient failures remain recoverable after cooldown", async () => {
  const { ctx, tables } = database([
    key(0, "flash", { consecutiveErrors: 20 }),
  ]);
  await report(ctx, {
    provider: "google",
    model: "flash",
    keyIndex: 0,
    errorMessage: "503 service unavailable",
  });
  assert.equal(tables.apiKeys[0].status, "error");
  tables.apiKeys[0].cooldownUntilMs = Date.now() - 1;
  assert.equal(
    (await select(ctx, { provider: "google", model: "flash", numKeys: 1 }))
      .keyIndex,
    0,
  );
});

test("quota cooldown is not bypassed by a generic auto-heal timer", async () => {
  const { ctx } = database([
    key(0, "flash", {
      status: "quota_exceeded",
      quotaResetTimeMs: Date.now() + 3_600_000,
      lastErrorTimeMs: Date.now() - 1_800_000,
    }),
    key(1, "flash"),
  ]);
  assert.equal(
    (await select(ctx, { provider: "google", model: "flash", numKeys: 2 }))
      .keyIndex,
    1,
  );
});
