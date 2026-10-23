import {
  sanitizeTopicHistory,
  TOPIC_HISTORY_KEY,
  type SuggestedTopic,
} from "./suggested-topics";

type TopicStores = {
  localStorage: Pick<Storage, "getItem" | "setItem">;
  sessionStorage: Pick<Storage, "getItem" | "setItem">;
};

export function readTopicHistory(stores: TopicStores): SuggestedTopic[] {
  for (const name of ["localStorage", "sessionStorage"] as const) {
    try {
      const value: unknown = JSON.parse(
        stores[name].getItem(TOPIC_HISTORY_KEY) ?? "null",
      );
      if (Array.isArray(value)) return sanitizeTopicHistory(value);
    } catch {
      // Try the old session history when local storage is unavailable or corrupt.
    }
  }
  return [];
}

export function rememberSuggestedTopics(
  stores: TopicStores,
  topics: SuggestedTopic[],
): void {
  // Read again after generation to keep history written by another tab while
  // the request was in flight. Storage failures must never hide the cards.
  const history = sanitizeTopicHistory([
    ...readTopicHistory(stores),
    ...topics,
  ]);
  for (const name of ["localStorage", "sessionStorage"] as const) {
    try {
      stores[name].setItem(TOPIC_HISTORY_KEY, JSON.stringify(history));
      return;
    } catch {
      // Private browsing or a full store may prevent persistence.
    }
  }
}
