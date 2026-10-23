import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildTopicPrompt,
  FALLBACK_TOPICS,
  isSameTopic,
  parseSuggestedTopics,
  sanitizeTopicHistory,
  selectSuggestedTopics,
  TOPIC_HISTORY_KEY,
  TOPIC_HISTORY_LIMIT,
  type SuggestedTopic,
} from "../src/lib/suggested-topics";
import {
  readTopicHistory,
  rememberSuggestedTopics,
} from "../src/lib/suggested-topic-history";

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
  };
}

test("twenty refreshes across browser sessions do not repeat fallback subjects", () => {
  const localStorage = memoryStorage();
  const shown: SuggestedTopic[] = [];
  for (let refresh = 0; refresh < 20; refresh++) {
    // Recreating session storage also simulates closing and reopening the tab.
    const stores = { localStorage, sessionStorage: memoryStorage() };
    const topics = selectSuggestedTopics([], readTopicHistory(stores));
    assert.equal(topics.length, 2);
    for (const topic of topics) {
      assert.ok(
        !shown.some((previous) => isSameTopic(topic, previous)),
        topic.title,
      );
      shown.push(topic);
    }
    rememberSuggestedTopics(stores, topics);
  }
  assert.deepEqual(
    readTopicHistory({ localStorage, sessionStorage: memoryStorage() }),
    shown,
  );
});

test("fallback titles are all used before repeating and then rotate by recency", () => {
  const history: SuggestedTopic[] = [];
  for (let refresh = 0; refresh < FALLBACK_TOPICS.length / 2; refresh++) {
    const topics = selectSuggestedTopics([], history);
    for (const topic of topics) {
      assert.ok(
        !history.some((previous) => previous.title === topic.title),
        topic.title,
      );
      history.push(topic);
    }
  }
  assert.equal(
    new Set(history.map((topic) => topic.title)).size,
    FALLBACK_TOPICS.length,
  );
  assert.deepEqual(selectSuggestedTopics([], history), history.slice(0, 2));
  assert.deepEqual(
    selectSuggestedTopics([], [...history, ...history.slice(0, 2)]),
    history.slice(2, 4),
  );
});

test("a last unseen fallback is used before recycling the oldest subject", () => {
  const history = FALLBACK_TOPICS.slice(0, -1);
  const topics = selectSuggestedTopics([], history);
  assert.deepEqual(topics, [FALLBACK_TOPICS.at(-1), FALLBACK_TOPICS[0]]);
});

test("reworded subjects and old title-only history are excluded", () => {
  const history = sanitizeTopicHistory([
    "How GPS Bends Time: Relativity Visualized",
    "Why Soap Bubbles Solve Geometry Problems — Visualized",
    {
      title: "How Sound Becomes Circles — Visualized",
      subject: "fourier transforms",
    },
  ]);
  const duplicates = [
    { title: "Relativity and GPS — Visualized", subject: "special relativity" },
    {
      title: "Soap Films and Minimal Surfaces — Visualized in 3D",
      subject: "minimal surfaces",
    },
    {
      title: "See Hidden Frequencies — Animated",
      subject: "fourier transform",
    },
  ];
  for (const [index, topic] of duplicates.entries()) {
    assert.ok(isSameTopic(topic, history[index]));
  }
  const selected = selectSuggestedTopics(duplicates, history);
  assert.equal(selected.length, 2);
  assert.ok(
    selected.every(
      (topic) => !history.some((previous) => isSameTopic(topic, previous)),
    ),
  );
  assert.ok(
    !isSameTopic(
      FALLBACK_TOPICS[0],
      FALLBACK_TOPICS.find((topic) => topic.subject === "volcanoes")!,
    ),
  );
});

test("a valid single model topic survives invalid or duplicate companions", () => {
  const valid = {
    title: "How Octopuses Change Color — Visualized",
    subject: "octopus camouflage",
  };
  for (const companion of [
    { title: "A topic with no visual hook", subject: "other subject" },
    { title: "Visualized " + "x".repeat(81), subject: "other subject" },
    { title: "Octopus Camouflage — Animated", subject: "octopus camouflage" },
    null,
  ]) {
    const parsed = parseSuggestedTopics(
      `Here are your ideas:\n${JSON.stringify([companion, valid])}`,
    );
    const topics = selectSuggestedTopics(parsed, []);
    assert.equal(topics.length, 2);
    assert.ok(
      topics.some(
        (topic) =>
          topic.title === valid.title || topic.subject === valid.subject,
      ),
    );
    assert.ok(!isSameTopic(topics[0], topics[1]));
  }
  assert.deepEqual(
    selectSuggestedTopics(parseSuggestedTopics(JSON.stringify([valid])), [])[0],
    valid,
  );
  assert.deepEqual(parseSuggestedTopics("invalid JSON"), []);
  assert.deepEqual(parseSuggestedTopics("[broken]"), []);
});

test("session titles migrate to persistent history and keep the latest 100 entries", () => {
  const stores = {
    localStorage: memoryStorage(),
    sessionStorage: memoryStorage(),
  };
  stores.sessionStorage.setItem(
    TOPIC_HISTORY_KEY,
    JSON.stringify(["How GPS Bends Time: Relativity Visualized"]),
  );
  assert.equal(readTopicHistory(stores)[0].subject, "");
  rememberSuggestedTopics(stores, [FALLBACK_TOPICS[0]]);
  assert.equal(
    readTopicHistory({ ...stores, sessionStorage: memoryStorage() }).length,
    2,
  );

  const many = Array.from({ length: 120 }, (_, index) => ({
    title: `Topic ${index} — Visualized`,
    subject: `subject ${index}`,
  }));
  rememberSuggestedTopics(stores, many);
  assert.deepEqual(readTopicHistory(stores), many.slice(-TOPIC_HISTORY_LIMIT));
  const prompt = buildTopicPrompt(readTopicHistory(stores));
  assert.ok(prompt.includes(JSON.stringify(many[20])));
  assert.ok(prompt.includes(JSON.stringify(many[119])));
  assert.match(prompt, /one from each of these fields: [^;\n]+; [^\n]+/);
  assert.match(prompt, /canonical subject/);
});

test("saving keeps changes from another tab made during generation", () => {
  const stores = {
    localStorage: memoryStorage(),
    sessionStorage: memoryStorage(),
  };
  assert.deepEqual(readTopicHistory(stores), []);
  rememberSuggestedTopics(stores, [FALLBACK_TOPICS[0]]);
  rememberSuggestedTopics(stores, [FALLBACK_TOPICS[1]]);
  assert.deepEqual(readTopicHistory(stores), FALLBACK_TOPICS.slice(0, 2));
});

test("malformed or blocked stores cannot break topic loading", () => {
  const sessionStorage = memoryStorage();
  const localStorage = memoryStorage();
  localStorage.setItem(TOPIC_HISTORY_KEY, "broken JSON");
  sessionStorage.setItem(
    TOPIC_HISTORY_KEY,
    JSON.stringify([null, 42, {}, "", { title: 12 }, FALLBACK_TOPICS[0]]),
  );
  assert.deepEqual(readTopicHistory({ localStorage, sessionStorage }), [
    FALLBACK_TOPICS[0],
  ]);

  const stores = {
    get localStorage(): ReturnType<typeof memoryStorage> {
      throw new Error("Storage denied");
    },
    sessionStorage,
  };
  rememberSuggestedTopics(stores, [FALLBACK_TOPICS[1]]);
  assert.deepEqual(readTopicHistory(stores), FALLBACK_TOPICS.slice(0, 2));
  const blocked = {
    getItem() {
      throw new Error("denied");
    },
    setItem() {
      throw new Error("full");
    },
  };
  assert.deepEqual(
    readTopicHistory({ localStorage: blocked, sessionStorage: blocked }),
    [],
  );
  assert.doesNotThrow(() =>
    rememberSuggestedTopics(
      { localStorage: blocked, sessionStorage: blocked },
      [FALLBACK_TOPICS[0]],
    ),
  );
});
