export type SuggestedTopic = { title: string; subject: string };

export const TOPIC_HISTORY_KEY = "eduvids-recent-topics";
export const TOPIC_HISTORY_LIMIT = 100;

// Each entry covers a different subject, so provider outages can still supply
// more than twenty refreshes without recycling the same ideas.
export const FALLBACK_TOPICS: SuggestedTopic[] = [
  ["minimal surfaces", "Why Soap Films Find the Smallest Surface — Visualized"],
  [
    "saturn rings",
    "Why Saturn's Rings Form Such Thin Disks — Visualized in 3D",
  ],
  ["honeycomb geometry", "Why Honeycombs Use Hexagons — Visualized"],
  ["neutrinos", "Neutrinos Passing Straight Through Earth — Visualized in 3D"],
  ["turbulence", "Why Turbulence Defeats Prediction — Visualized in 3D"],
  [
    "ant colony optimization",
    "How Ant Colonies Find the Shortest Path — Visualized",
  ],
  [
    "spinning coins",
    "Why a Spinning Coin Suddenly Speeds Up — Visualized in 3D",
  ],
  ["complex numbers", "How Imaginary Numbers Rotate Real Waves — Visualized"],
  ["infinity cardinality", "Why Some Infinities Are Larger — Visualized"],
  ["relativity", "How GPS Bends Time: Relativity Visualized"],
  ["quantum tunneling", "How Quantum Tunneling Powers the Sun — Visualized"],
  ["plate tectonics", "How Continents Drift Across Earth — Visualized in 3D"],
  ["dna replication", "How DNA Copies Itself — Animated One Base at a Time"],
  ["photosynthesis", "How Leaves Turn Sunlight Into Sugar — Visualized"],
  [
    "protein folding",
    "How Proteins Fold Into Tiny Machines — Visualized in 3D",
  ],
  [
    "natural selection",
    "How Natural Selection Changes a Population — Animated",
  ],
  ["neuron signaling", "How Neurons Send Electrical Messages — Visualized"],
  [
    "immune response",
    "How Your Immune System Recognizes an Invader — Animated",
  ],
  ["coral bleaching", "Why Corals Lose Their Color — Visualized"],
  [
    "fungal networks",
    "How Fungal Networks Spread Underground — Visualized in 3D",
  ],
  ["capillary action", "How Water Climbs Against Gravity — Visualized in 3D"],
  ["rainbows", "How Raindrops Split Sunlight Into Rainbows — Visualized"],
  ["magnetic fields", "How Magnets Shape Invisible Fields — Visualized in 3D"],
  ["doppler effect", "Why a Passing Siren Changes Pitch — Visualized"],
  ["gyroscopes", "Why a Gyroscope Resists Falling — Visualized in 3D"],
  ["heat conduction", "How Heat Moves Through a Metal Rod — Animated"],
  ["crystal growth", "How Crystals Build Themselves — Visualized in 3D"],
  [
    "chemical equilibrium",
    "Why Chemical Reactions Reach a Balance — Visualized",
  ],
  ["electrolysis", "How Electricity Splits Water Apart — Visualized in 3D"],
  ["chirality", "Why Mirror-Image Molecules Behave Differently — Visualized"],
  ["radioactive decay", "Why Radioactive Atoms Have a Half-Life — Animated"],
  ["carbon dating", "How Carbon Dating Reveals an Object's Age — Visualized"],
  ["volcanoes", "How Magma Finds Its Way to the Surface — Visualized in 3D"],
  ["glacier flow", "How Glaciers Flow Like Slow Rivers — Visualized"],
  ["ocean tides", "Why the Ocean Has Two Tidal Bulges — Visualized in 3D"],
  ["weather fronts", "How Colliding Air Masses Create Storms — Animated in 3D"],
  ["stellar nucleosynthesis", "How Stars Build the Elements — Visualized"],
  [
    "exoplanet transits",
    "How a Tiny Dip in Starlight Reveals a Planet — Visualized",
  ],
  ["lunar phases", "Why the Moon Changes Shape Each Month — Visualized in 3D"],
  ["galaxy rotation", "Why Galaxies Rotate Faster Than Expected — Visualized"],
  ["prime numbers", "Why Prime Numbers Never Run Out — Visualized"],
  ["mobius strips", "How a Mobius Strip Has Just One Side — Visualized in 3D"],
  ["voronoi diagrams", "How Voronoi Diagrams Divide Space — Visualized"],
  ["fractals", "How Fractals Hide Infinite Detail — Visualized"],
  [
    "pythagorean theorem",
    "Why Pythagoras Works: A Moving-Squares Visual Proof",
  ],
  ["bayes theorem", "How New Evidence Changes Probability — Bayes Visualized"],
  ["birthday paradox", "Why 23 People Can Share a Birthday — Visualized"],
  [
    "central limit theorem",
    "Why Random Averages Form a Bell Curve — Visualized",
  ],
  ["graph coloring", "How Many Colors Does a Map Really Need? Visualized"],
  [
    "fourier transforms",
    "How Fourier Transforms Separate a Sound — Visualized",
  ],
  ["binary search", "How Binary Search Halves the Work — Animated"],
  [
    "sorting algorithms",
    "Why Some Sorting Algorithms Win — Animated Side by Side",
  ],
  ["error correction", "How Extra Bits Repair a Broken Message — Visualized"],
  [
    "public key encryption",
    "How Public Keys Keep Messages Secret — Visualized",
  ],
  ["compression", "How Repeated Patterns Shrink a File — Visualized"],
  ["cellular automata", "How Simple Grid Rules Create Complex Life — Animated"],
  [
    "gradient descent",
    "How Gradient Descent Finds a Valley — Visualized in 3D",
  ],
  ["bezier curves", "How Control Points Bend a Bezier Curve — Visualized"],
  [
    "projective geometry",
    "Why Parallel Lines Meet in Perspective — Visualized in 3D",
  ],
  ["resonance", "How Tiny Pushes Build Huge Vibrations — Visualized"],
].map(([subject, title]) => ({ subject, title }));

export function sanitizeTopicHistory(value: unknown): SuggestedTopic[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((entry): SuggestedTopic[] => {
      // Titles saved by the old sessionStorage implementation still exclude
      // reworded ideas using the same keyword comparison as new entries.
      const topic =
        typeof entry === "string" ? { title: entry, subject: "" } : entry;
      if (!topic || typeof topic.title !== "string") return [];
      const title = topic.title.trim();
      if (!title || title.length > 80) return [];
      const subject =
        typeof topic.subject === "string"
          ? topic.subject.trim().slice(0, 80)
          : "";
      return [{ title, subject }];
    })
    .slice(-TOPIC_HISTORY_LIMIT);
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const TITLE_WORDS = new Set(
  "a an the why how what when where does do is are can in into on of for from to and or with without its your it some really just one two through across than find explained visual visually visualized visualised animated 3d physics mathematics math hidden real works".split(
    " ",
  ),
);

function keywords(text: string): Set<string> {
  return new Set(
    normalize(text)
      .replace(
        /\b(?:gps|(?:general |special )?relativity|spacetime)\b/g,
        "relativity",
      )
      .replace(
        /\b(?:soap (?:bubbles?|films?)|minimal surfaces?)\b/g,
        "minimal surface",
      )
      .replace(/\b(?:imaginary|complex) numbers?\b/g, "complex number")
      .replace(/\bfft\b/g, "fourier")
      .split(" ")
      .filter((word) => word.length > 2 && !TITLE_WORDS.has(word))
      .map((word) => word.replace(/ies$/, "y").replace(/s$/, "")),
  );
}

function similarWords(left: string, right: string): boolean {
  const a = keywords(left);
  const b = keywords(right);
  const shorter = Math.min(a.size, b.size);
  if (!shorter) return false;
  const shared = [...a].filter((word) => b.has(word)).length;
  return shared >= (shorter === 1 ? 1 : 2) && shared / shorter >= 0.5;
}

export function isSameTopic(a: SuggestedTopic, b: SuggestedTopic): boolean {
  return (
    normalize(a.title) === normalize(b.title) ||
    [a.subject, a.title].some((left) =>
      [b.subject, b.title].some((right) => similarWords(left, right)),
    )
  );
}

export function parseSuggestedTopics(text: string): SuggestedTopic[] {
  const json = text.match(/\[[\s\S]*\]/)?.[0];
  if (!json) return [];
  try {
    return sanitizeTopicHistory(JSON.parse(json));
  } catch {
    return [];
  }
}

function shuffled<T>(items: readonly T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function selectSuggestedTopics(
  generated: SuggestedTopic[],
  history: SuggestedTopic[],
): SuggestedTopic[] {
  const selected: SuggestedTopic[] = [];
  for (const topic of generated) {
    if (
      topic.title.length <= 80 &&
      /\b(?:visual|visually|visualized|visualised|3d|animated)\b/i.test(
        topic.title,
      ) &&
      ![...history, ...selected].some((previous) =>
        isSameTopic(topic, previous),
      )
    ) {
      selected.push(topic);
      if (selected.length === 2) return selected;
    }
  }

  // Unseen subjects have rank -1. After exhaustion reuse the subject whose
  // latest appearance is oldest, retaining any valid model-generated card.
  const ranked = shuffled(FALLBACK_TOPICS)
    .map((topic) => ({
      topic,
      lastSeen: history.reduce(
        (last, previous, index) =>
          isSameTopic(topic, previous) ? index : last,
        -1,
      ),
    }))
    .sort((a, b) => a.lastSeen - b.lastSeen);
  for (const { topic } of ranked) {
    if (!selected.some((previous) => isSameTopic(topic, previous))) {
      selected.push(topic);
      if (selected.length === 2) break;
    }
  }
  return selected;
}

const TOPIC_FIELDS = [
  "geometry and topology",
  "probability and statistics",
  "number theory",
  "mechanics",
  "optics and acoustics",
  "electricity and magnetism",
  "chemistry and materials",
  "cell biology",
  "ecology and evolution",
  "earth science",
  "astronomy",
  "computer science and algorithms",
];

export function buildTopicPrompt(history: SuggestedTopic[]): string {
  const fields = shuffled(TOPIC_FIELDS).slice(0, 2);
  return [
    `Generate exactly two title-ready ideas for 5-minute animated educational videos: one from each of these fields: ${fields.join("; ")}.`,
    "Every title MUST include a visual hook: Visualized, Visually, In 3D, or Animated.",
    "Make the subject and visual insight specific. Vary curiosity structures such as Why, How, What, or a surprising contrast.",
    "Aim for 45-65 characters and never exceed 80. Use natural title case. Avoid Introduction, Basics, Lesson, and vague clickbait.",
    "For each title return a short canonical subject keyword or phrase identifying its core scientific concept, independent of the title wording or application.",
    "Choose substantially different subjects. Do not repeat ANY excluded subject, even with a new title or application. If a field is exhausted, choose another field.",
    `Excluded recent titles and subjects (oldest first): ${JSON.stringify(history)}`,
    `Variation seed: ${crypto.randomUUID()}`,
    'Return ONLY a JSON array of two objects with string keys "title" and "subject".',
  ].join("\n");
}
