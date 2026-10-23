import {
  sanitizeTopicHistory,
  TOPIC_HISTORY_KEY,
  type SuggestedTopic,
} from "./suggested-topics";

type TopicStores = {
  localStorage: Pick<Storage, "getItem" | "setItem">;
  sessionStorage: Pick<Storage, "getItem" | "setItem">;
};

type SavedTopicHistory = { topics: SuggestedTopic[]; savedAt: number };

function readSavedHistory(stores: TopicStores): SavedTopicHistory {
  let latest: SavedTopicHistory = { topics: [], savedAt: -1 };
  for (const name of ["localStorage", "sessionStorage"] as const) {
    try {
      const value: unknown = JSON.parse(
        stores[name].getItem(TOPIC_HISTORY_KEY) ?? "null",
      );
      // Arrays are the legacy format. A timestamp lets a successful session
      // fallback outrank readable but stale local history, and vice versa.
      const saved = Array.isArray(value)
        ? { topics: value, savedAt: 0 }
        : value;
      if (
        saved &&
        typeof saved === "object" &&
        "topics" in saved &&
        Array.isArray(saved.topics) &&
        "savedAt" in saved &&
        typeof saved.savedAt === "number" &&
        Number.isSafeInteger(saved.savedAt) &&
        saved.savedAt >= 0 &&
        saved.savedAt > latest.savedAt
      ) {
        latest = {
          topics: sanitizeTopicHistory(saved.topics),
          savedAt: saved.savedAt,
        };
      }
    } catch {
      // Try the old session history when local storage is unavailable or corrupt.
    }
  }
  return latest;
}

export function readTopicHistory(stores: TopicStores): SuggestedTopic[] {
  return readSavedHistory(stores).topics;
}

export function rememberSuggestedTopics(
  stores: TopicStores,
  topics: SuggestedTopic[],
): void {
  // Read again after generation to keep history written by another tab while
  // the request was in flight. Storage failures must never hide the cards.
  const previous = readSavedHistory(stores);
  const history: SavedTopicHistory = {
    topics: sanitizeTopicHistory([...previous.topics, ...topics]),
    // Keep saves ordered even when multiple updates happen in one millisecond.
    savedAt: Math.max(Date.now(), previous.savedAt + 1),
  };
  for (const name of ["localStorage", "sessionStorage"] as const) {
    try {
      stores[name].setItem(TOPIC_HISTORY_KEY, JSON.stringify(history));
      return;
    } catch {
      // Private browsing or a full store may prevent persistence.
    }
  }
}
