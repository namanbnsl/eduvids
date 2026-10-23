export type SuggestedTopic = { title: string; subject: string };

export const TOPIC_HISTORY_KEY = "eduvids-recent-topics";
export const TOPIC_HISTORY_LIMIT = 100;

// Each entry covers a different subject, so provider outages can still supply
// more than twenty refreshes without recycling the same ideas.
export const FALLBACK_TOPICS: SuggestedTopic[] = [
  ["minimal surfaces", "Why Are Soap Bubbles Spherical?"],
  ["saturn rings", "Why Are Saturn's Rings So Flat?"],
  ["honeycomb geometry", "Why Do Bees Build Hexagons?"],
  ["neutrinos", "How Can a Particle Pass Straight Through Earth?"],
  ["turbulence", "Why Is Turbulence So Hard to Predict?"],
  ["ant colony optimization", "How Do Ants Find Food Without a Map?"],
  ["spinning coins", "Why Does a Spinning Coin Rattle Faster as It Stops?"],
  ["complex numbers", "What Does Multiplying by i Actually Do?"],
  ["infinity cardinality", "How Can One Infinity Be Bigger Than Another?"],
  ["relativity", "Why Does GPS Need Einstein?"],
  ["quantum tunneling", "How Do Particles Cross Barriers They Can't Climb?"],
  [
    "plate tectonics",
    "How Can Two Continents Fit Together Like Puzzle Pieces?",
  ],
  ["dna replication", "How Does a Cell Copy Two Metres of DNA?"],
  ["photosynthesis", "Where Does a Tree's Mass Come From?"],
  ["protein folding", "How Does a Protein's Shape Decide What It Does?"],
  ["natural selection", "How Does Antibiotic Resistance Evolve?"],
  ["neuron signaling", "How Does a Nerve Signal Travel to Your Fingertip?"],
  ["immune response", "How Does a Vaccine Train Your Immune System?"],
  ["coral bleaching", "Why Do Corals Turn White When the Ocean Warms?"],
  ["fungal networks", "Why Is a Mushroom Only Part of the Fungus?"],
  ["capillary action", "How Does a Paper Towel Pull Water Uphill?"],
  ["rainbows", "Why Is a Rainbow a Circle?"],
  ["magnetic fields", "Why Can't You Separate a Magnet's Two Poles?"],
  ["doppler effect", "Why Does an Ambulance Sound Different as It Passes?"],
  ["gyroscopes", "Why Doesn't a Spinning Top Fall Over Right Away?"],
  ["heat conduction", "Why Does Metal Feel Colder Than Wood?"],
  ["crystal growth", "Why Does Salt Grow Into Cubes?"],
  ["chemical equilibrium", "How Can a Reaction Keep Going Without Changing?"],
  ["electrolysis", "How Can Electricity Split Water Into Two Gases?"],
  ["chirality", "Why Can Mirror-Image Molecules Smell Different?"],
  ["radioactive decay", "Why Can't We Predict When One Atom Will Decay?"],
  ["carbon dating", "How Can Carbon Tell Us the Age of a Bone?"],
  ["volcanoes", "Why Do Some Volcanoes Explode While Others Ooze?"],
  ["glacier flow", "How Can Solid Ice Flow Like a River?"],
  ["ocean tides", "Why Are There Tides on Both Sides of Earth?"],
  ["cloud formation", "Why Does Rising Air Turn Into Clouds?"],
  ["stellar nucleosynthesis", "How Do Stars Make the Elements in Your Body?"],
  ["exoplanet transits", "How Can We Find a Planet We Can't See?"],
  ["tidal locking", "Why Do We Always See the Same Side of the Moon?"],
  ["galaxy rotation", "What Keeps the Outer Stars of a Galaxy Moving So Fast?"],
  ["prime numbers", "Why Will We Never Run Out of Prime Numbers?"],
  ["mobius strips", "What Happens When You Cut a Mobius Strip in Half?"],
  ["voronoi diagrams", "How Do You Draw a Map of the Nearest Pizza Shop?"],
  ["fractals", "How Can a Finite Shape Have an Infinite Perimeter?"],
  ["pythagorean theorem", "Why Does a² + b² = c² Describe a Right Triangle?"],
  ["bayes theorem", "When Can a Positive Test Result Be Misleading?"],
  ["birthday paradox", "Why Do Birthday Matches Get Likely at Just 23 People?"],
  [
    "central limit theorem",
    "Why Do Dice Totals Start to Look Like a Bell Curve?",
  ],
  ["graph coloring", "Why Are Four Colors Enough for Any Flat Map?"],
  ["fourier transforms", "How Can Circles Add Up to a Square Wave?"],
  ["binary search", "How Can 20 Questions Find One Item in a Million?"],
  ["sorting algorithms", "Why Can Sorting the Same List Take So Much Longer?"],
  ["error correction", "How Can a Scratched QR Code Still Work?"],
  ["public key encryption", "How Can You Share a Secret in Public?"],
  ["compression", "How Can a ZIP File Shrink Without Losing Anything?"],
  ["cellular automata", "How Can Four Simple Rules Make a Pattern That Moves?"],
  ["gradient descent", "How Does a Neural Network Learn From a Wrong Answer?"],
  ["bezier curves", "How Do Four Points Draw a Smooth Curve?"],
  ["projective geometry", "Why Do Parallel Train Tracks Seem to Meet?"],
  ["resonance", "How Can Small Pushes Make a Swing Go Higher?"],
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
  const subject = normalize(a.subject);
  return (
    normalize(a.title) === normalize(b.title) ||
    (subject !== "" && subject === normalize(b.subject)) ||
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
      isUsableTopic(topic) &&
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

function isUsableTopic(topic: SuggestedTopic): boolean {
  // These are already animated videos. Production labels waste the small card
  // and previously let any premise pass as long as it contained "Visualized".
  const productionLabel =
    /^(?:visually|animated|visuali[sz]ed|in 3d)\b|(?:[—–:|\-]\s*|\s+)(?:visually|animated|visuali[sz]ed|(?:visuali[sz]ed )?in 3d)\s*[.!?]?$/i;
  return (
    topic.title.trim().length >= 12 &&
    topic.title.length <= 80 &&
    topic.subject.trim().length > 0 &&
    !productionLabel.test(topic.title)
  );
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
    `Suggest exactly two questions a curious person would want answered in a short educational video, one from each of these fields: ${fields.join("; ")}.`,
    "Start with an established concept and find a concrete puzzle, surprising result, or everyday experience it explains. The question should make sense without specialist knowledge.",
    "Write for a curious teenager browsing suggestions, not someone already studying the field. Name something they can picture. Avoid unexplained jargon, named algorithms, and complexity notation such as O(1); show a familiar situation instead.",
    "Prefer subjects where moving shapes, plotted data, particles, or a simple simulation can reveal the answer. Each idea must have a clear explanation that fits in five minutes.",
    "Use a short, natural question, usually 6-12 words. Never exceed 80 characters. No production labels such as Visually, Visualized, Animated, or In 3D; no generic textbook chapter names or empty hype.",
    'Examples of the desired specificity and tone: "Why Does Metal Feel Colder Than Wood?", "How Can One Infinity Be Bigger Than Another?", "Where Does a Tree\'s Mass Come From?", "How Can a Scratched QR Code Still Work?". These show the style; find different subjects.',
    "Accuracy is essential: check the premise before writing the question. Do not invent a phenomenon to make a title surprising, confuse different mechanisms, or imply an unsolved problem has a settled answer.",
    "Keep necessary conditions in the question: do not generalize a feature of humans to all animals, an average-case result to every case, or a result of one experimental setup to all setups.",
    'Reject premises like "a whisper becomes a sonic boom in a tunnel" (echoes and sonic booms are different phenomena). Avoid unsourced trends like "the Sahara is growing faster than expected", recent discoveries, or arbitrary numerical claims.',
    "Privately consider several candidates, discard any with a doubtful premise or a dull payoff, and return the strongest two. The curiosity must come from the concept itself.",
    "For each title return a short canonical subject keyword or phrase (1-4 words) identifying its core scientific concept, independent of the title wording or application.",
    "Choose substantially different subjects. Do not repeat ANY excluded subject, even with a new title or application. If a field is exhausted, choose another field.",
    `Excluded recent titles and subjects (oldest first): ${JSON.stringify(history)}`,
    `Variation seed: ${crypto.randomUUID()}`,
    'Return ONLY a JSON array of two objects with string keys "title" and "subject".',
  ].join("\n");
}
