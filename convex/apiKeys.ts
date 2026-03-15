import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const WINDOW_24H_MS = 86_400_000; // 24 hours
const AUTO_HEAL_AFTER_MS = 900_000; // 15 minutes

type KeyStatus =
  | "healthy"
  | "rate_limited"
  | "quota_exceeded"
  | "blocked"
  | "error";

type ModelPolicy = {
  maxRequestsPer24hPerKey: number;
  rateLimitCooldownMs: number;
  quotaResetDelayMs: number;
  errorCooldownMs: number;
  maxConsecutiveErrors: number;
};

const MODEL_POLICIES: Record<string, ModelPolicy> = {
  // Higher quality model – free tier: 5 RPM, 250K TPM, 20 RPD
  "gemini-3-flash-preview": {
    maxRequestsPer24hPerKey: 20,
    rateLimitCooldownMs: 90_000,
    quotaResetDelayMs: 3_600_000,
    errorCooldownMs: 45_000,
    maxConsecutiveErrors: 3,
  },
  // Faster/cheaper fallback model – free tier: 15 RPM, 250K TPM, 500 RPD
  "gemini-3.1-flash-lite-preview": {
    maxRequestsPer24hPerKey: 500,
    rateLimitCooldownMs: 45_000,
    quotaResetDelayMs: 1_800_000,
    errorCooldownMs: 20_000,
    maxConsecutiveErrors: 4,
  },
};

const DEFAULT_MODEL_POLICY: ModelPolicy = {
  maxRequestsPer24hPerKey: 2_000,
  rateLimitCooldownMs: 60_000,
  quotaResetDelayMs: 3_600_000,
  errorCooldownMs: 30_000,
  maxConsecutiveErrors: 3,
};

function resolveModelPolicy(model: string): ModelPolicy {
  if (MODEL_POLICIES[model]) return MODEL_POLICIES[model];

  if (model.includes("3-flash")) {
    return MODEL_POLICIES["gemini-3-flash-preview"];
  }
  if (model.includes("3.1-flash-lite")) {
    return MODEL_POLICIES["gemini-3.1-flash-lite-preview"];
  }

  return DEFAULT_MODEL_POLICY;
}

function classifyError(
  errorMessage: string,
  policy: ModelPolicy,
): {
  status: KeyStatus;
  cooldownMs?: number;
} {
  const lower = errorMessage.toLowerCase();

  if (
    lower.includes("rate limit") ||
    lower.includes("429") ||
    lower.includes("quota exceeded per minute") ||
    lower.includes("too many requests")
  ) {
    return { status: "rate_limited", cooldownMs: policy.rateLimitCooldownMs };
  }

  if (
    lower.includes("quota exceeded") ||
    lower.includes("billing not enabled") ||
    lower.includes("quota has been exhausted") ||
    lower.includes("insufficient quota")
  ) {
    return { status: "quota_exceeded", cooldownMs: policy.quotaResetDelayMs };
  }

  if (
    lower.includes("401") ||
    lower.includes("403") ||
    lower.includes("unauthorized") ||
    lower.includes("api key not valid") ||
    lower.includes("api key invalid")
  ) {
    return { status: "blocked" };
  }

  return { status: "error", cooldownMs: policy.errorCooldownMs };
}

function getKeyWaitMs(
  key: {
    status: KeyStatus;
    cooldownUntilMs?: number;
    quotaResetTimeMs?: number;
  },
  now: number,
): number {
  if (key.status === "quota_exceeded") {
    return key.quotaResetTimeMs ? Math.max(0, key.quotaResetTimeMs - now) : 0;
  }

  if (key.status === "rate_limited" || key.status === "error") {
    return key.cooldownUntilMs ? Math.max(0, key.cooldownUntilMs - now) : 0;
  }

  return 0;
}

/**
 * Select the best available API key for a provider + model.
 * This mutation atomically updates round-robin state and key health.
 */
export const selectKey = mutation({
  args: {
    provider: v.string(),
    model: v.string(),
    numKeys: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const policy = resolveModelPolicy(args.model);

    const existingKeys = await ctx.db
      .query("apiKeys")
      .withIndex("by_provider_model", (q) =>
        q.eq("provider", args.provider).eq("model", args.model),
      )
      .collect();

    const existingIndexes = new Set(existingKeys.map((k) => k.keyIndex));
    for (let i = 0; i < args.numKeys; i++) {
      if (!existingIndexes.has(i)) {
        await ctx.db.insert("apiKeys", {
          keyIndex: i,
          provider: args.provider,
          model: args.model,
          status: "healthy",
          requestCount24h: 0,
          windowStartMs: now,
          consecutiveErrors: 0,
          successCount: 0,
          errorCount: 0,
          updatedAtMs: now,
        });
      }
    }

    let state = await ctx.db
      .query("apiKeyManagerState")
      .withIndex("by_provider_model", (q) =>
        q.eq("provider", args.provider).eq("model", args.model),
      )
      .first();

    if (!state) {
      const stateId = await ctx.db.insert("apiKeyManagerState", {
        provider: args.provider,
        model: args.model,
        lastUsedIndex: -1,
        updatedAtMs: now,
      });
      state = (await ctx.db.get(stateId))!;
    }

    const keys = (await ctx.db
      .query("apiKeys")
      .withIndex("by_provider_model", (q) =>
        q.eq("provider", args.provider).eq("model", args.model),
      )
      .collect())
      .filter((k) => k.keyIndex < args.numKeys)
      .sort((a, b) => a.keyIndex - b.keyIndex);

    if (keys.length === 0) {
      throw new Error(`No API keys registered for ${args.provider}/${args.model}`);
    }

    const available: typeof keys = [];

    for (const key of keys) {
      let updated = false;

      if (now - key.windowStartMs >= WINDOW_24H_MS) {
        key.requestCount24h = 0;
        key.windowStartMs = now;
        key.quotaResetTimeMs = undefined;
        if (key.status === "quota_exceeded") {
          key.status = "healthy";
        }
        updated = true;
      }

      if (
        key.status !== "healthy" &&
        key.lastErrorTimeMs &&
        now - key.lastErrorTimeMs > AUTO_HEAL_AFTER_MS
      ) {
        key.status = "healthy";
        key.consecutiveErrors = 0;
        key.cooldownUntilMs = undefined;
        key.quotaResetTimeMs = undefined;
        updated = true;
      }

      if (key.status === "rate_limited" && key.cooldownUntilMs && now >= key.cooldownUntilMs) {
        key.status = "healthy";
        key.cooldownUntilMs = undefined;
        updated = true;
      }

      if (key.status === "error" && key.cooldownUntilMs && now >= key.cooldownUntilMs) {
        key.status = "healthy";
        key.consecutiveErrors = 0;
        key.cooldownUntilMs = undefined;
        updated = true;
      }

      if (key.status === "quota_exceeded" && key.quotaResetTimeMs && now >= key.quotaResetTimeMs) {
        key.status = "healthy";
        key.quotaResetTimeMs = undefined;
        updated = true;
      }

      if (key.requestCount24h >= policy.maxRequestsPer24hPerKey && key.status !== "blocked") {
        key.status = "quota_exceeded";
        key.quotaResetTimeMs = key.windowStartMs + WINDOW_24H_MS;
        updated = true;
      }

      if (updated) {
        await ctx.db.patch(key._id, {
          status: key.status,
          requestCount24h: key.requestCount24h,
          windowStartMs: key.windowStartMs,
          consecutiveErrors: key.consecutiveErrors,
          cooldownUntilMs: key.cooldownUntilMs,
          quotaResetTimeMs: key.quotaResetTimeMs,
          updatedAtMs: now,
        });
      }

      if (
        key.status === "healthy" &&
        key.requestCount24h < policy.maxRequestsPer24hPerKey
      ) {
        available.push(key);
      }
    }

    if (available.length === 0) {
      let shortestWait = Number.POSITIVE_INFINITY;

      for (const key of keys) {
        if (key.status === "blocked") continue;
        shortestWait = Math.min(shortestWait, getKeyWaitMs(key, now));
      }

      const waitSeconds =
        shortestWait === Number.POSITIVE_INFINITY
          ? null
          : Math.ceil(shortestWait / 1000);

      throw new Error(
        waitSeconds == null
          ? `No available API keys for ${args.provider}/${args.model}; all keys are blocked.`
          : `No available API keys for ${args.provider}/${args.model}; retry after ~${waitSeconds}s.`,
      );
    }

    const startSearchIndex = (state.lastUsedIndex + 1) % args.numKeys;
    let selected = available[0];
    for (const candidate of available) {
      if (candidate.keyIndex >= startSearchIndex) {
        selected = candidate;
        break;
      }
    }

    await ctx.db.patch(selected._id, {
      requestCount24h: selected.requestCount24h + 1,
      updatedAtMs: now,
    });

    await ctx.db.patch(state._id, {
      lastUsedIndex: selected.keyIndex,
      updatedAtMs: now,
    });

    return { keyIndex: selected.keyIndex };
  },
});

export const reportSuccess = mutation({
  args: {
    provider: v.string(),
    model: v.string(),
    keyIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const key = await ctx.db
      .query("apiKeys")
      .withIndex("by_provider_model_keyIndex", (q) =>
        q
          .eq("provider", args.provider)
          .eq("model", args.model)
          .eq("keyIndex", args.keyIndex),
      )
      .first();

    if (!key) return;

    const updates: Record<string, unknown> = {
      successCount: key.successCount + 1,
      consecutiveErrors: 0,
      updatedAtMs: Date.now(),
    };

    if (key.status === "error" || key.status === "rate_limited") {
      updates.status = "healthy";
      updates.cooldownUntilMs = undefined;
    }

    await ctx.db.patch(key._id, updates);
  },
});

export const reportError = mutation({
  args: {
    provider: v.string(),
    model: v.string(),
    keyIndex: v.number(),
    errorMessage: v.string(),
  },
  handler: async (ctx, args) => {
    const key = await ctx.db
      .query("apiKeys")
      .withIndex("by_provider_model_keyIndex", (q) =>
        q
          .eq("provider", args.provider)
          .eq("model", args.model)
          .eq("keyIndex", args.keyIndex),
      )
      .first();

    if (!key) return;

    const now = Date.now();
    const policy = resolveModelPolicy(args.model);
    const classification = classifyError(args.errorMessage, policy);

    const newConsecutiveErrors = key.consecutiveErrors + 1;
    let status = classification.status;

    if (newConsecutiveErrors >= policy.maxConsecutiveErrors) {
      status = "blocked";
    }

    const updates: Record<string, unknown> = {
      errorCount: key.errorCount + 1,
      consecutiveErrors: newConsecutiveErrors,
      lastError: args.errorMessage.slice(0, 500),
      lastErrorTimeMs: now,
      status,
      updatedAtMs: now,
    };

    if (classification.cooldownMs) {
      updates.cooldownUntilMs = now + classification.cooldownMs;
    }

    if (classification.status === "quota_exceeded") {
      updates.quotaResetTimeMs = now + policy.quotaResetDelayMs;
    }

    await ctx.db.patch(key._id, updates);
  },
});

export const getHealthStatus = query({
  args: { provider: v.string(), model: v.string() },
  handler: async (ctx, args) => {
    const policy = resolveModelPolicy(args.model);

    const keys = await ctx.db
      .query("apiKeys")
      .withIndex("by_provider_model", (q) =>
        q.eq("provider", args.provider).eq("model", args.model),
      )
      .collect();

    return keys.map((k) => ({
      keyIndex: k.keyIndex,
      status: k.status,
      requestCount24h: k.requestCount24h,
      maxRequestsPer24hPerKey: policy.maxRequestsPer24hPerKey,
      windowStartMs: k.windowStartMs,
      resetTimeMs: k.windowStartMs + WINDOW_24H_MS,
      cooldownUntilMs: k.cooldownUntilMs,
      quotaResetTimeMs: k.quotaResetTimeMs,
      consecutiveErrors: k.consecutiveErrors,
      successCount: k.successCount,
      errorCount: k.errorCount,
      lastError: k.lastError,
      lastErrorTimeMs: k.lastErrorTimeMs,
    }));
  },
});

export const resetAllKeys = mutation({
  args: { provider: v.string(), model: v.string() },
  handler: async (ctx, args) => {
    const keys = await ctx.db
      .query("apiKeys")
      .withIndex("by_provider_model", (q) =>
        q.eq("provider", args.provider).eq("model", args.model),
      )
      .collect();

    const now = Date.now();
    for (const key of keys) {
      await ctx.db.patch(key._id, {
        status: "healthy" as const,
        consecutiveErrors: 0,
        cooldownUntilMs: undefined,
        quotaResetTimeMs: undefined,
        updatedAtMs: now,
      });
    }
  },
});
