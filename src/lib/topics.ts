export type TopicSlug =
  | "mathematics"
  | "calculus"
  | "probability"
  | "physics"
  | "chemistry";

export type Topic = {
  slug: TopicSlug;
  name: string;
  /** Page heading and <title>. */
  title: string;
  /** Meta description, under 160 characters. */
  description: string;
  intro: string[];
  /** Ideas a visitor can generate in one click. */
  prompts: string[];
};

export const TOPICS: Topic[] = [
  {
    slug: "calculus",
    name: "Calculus",
    title: "Calculus Explained Visually",
    description:
      "Free animated calculus explainers: integrals and areas under curves, drawn step by step. Watch examples or generate a narrated video on any calculus idea.",
    intro: [
      "Calculus is easier to see than to read. A derivative is a slope you can watch settle; an integral is area you can watch fill in as the rectangles get thinner.",
      "These videos are rendered from code, so every curve, tangent and shaded region sits exactly where the math says it should.",
    ],
    prompts: [
      "Why is the derivative of sin x equal to cos x?",
      "What does a limit actually mean? Show the gap shrinking to zero.",
      "Why does the fundamental theorem of calculus connect slopes and areas?",
    ],
  },
  {
    slug: "probability",
    name: "Probability",
    title: "Probability Explained Visually",
    description:
      "Free animated probability explainers: density curves and overlapping events, made countable. Watch examples or generate your own narrated video.",
    intro: [
      "Probability goes wrong when it stays abstract. Count the outcomes, draw the overlap, shade the area under the curve, and most paradoxes stop being paradoxes.",
      "Each video turns a rule into something you can count or measure on screen.",
    ],
    prompts: [
      "Explain Bayes’ theorem with a medical test and 1,000 people.",
      "Why does the birthday paradox need only 23 people?",
      "What is expected value? Show it with a fair and an unfair die.",
    ],
  },
  {
    slug: "chemistry",
    name: "Chemistry",
    title: "Chemistry Explained Visually",
    description:
      "Free animated chemistry explainers: bonds, molecules and reactions, drawn step by step. Watch examples or generate a narrated video on any chemistry idea.",
    intro: [
      "Chemistry happens at a scale nobody can see, which is exactly why it suits animation. Atoms, electron shells and bonds can be drawn, moved and compared directly.",
      "These videos build each idea from the atom up, so the rule arrives after you have already seen why it holds.",
    ],
    prompts: [
      "Why is water a bent molecule? Show its lone pairs pushing the bonds.",
      "What makes a reaction exothermic? Compare bond energies before and after.",
      "Why does the periodic table repeat? Show electron shells filling.",
    ],
  },
  {
    slug: "physics",
    name: "Physics",
    title: "Physics Explained Visually",
    description:
      "Free animated physics explainers: chaos, fluids and gravitational waves with real equations. Watch examples or generate a narrated physics video.",
    intro: [
      "Physics is about how things move, so it should be explained with motion. Turn a knob, watch the effect, then see the equation that predicted it.",
      "Every animation here is computed, not illustrated, so pendulums swing and waves travel the way the physics says.",
    ],
    prompts: [
      "Why does a pendulum’s period not depend on its mass?",
      "How does a lens bend light to form an image?",
      "Why do satellites in orbit feel weightless?",
    ],
  },
  {
    slug: "mathematics",
    name: "Mathematics",
    title: "Math Explained Visually",
    description:
      "Free animated math explainers on geometry, calculus, proof and famous open problems. Watch examples or generate a narrated video on any math concept.",
    intro: [
      "Good math explanations show the idea before the notation. These videos move pieces, scale shapes and run algorithms on visible data, then name what you just saw.",
      "From the pigeonhole principle to hyperbolic geometry, each one starts from a question and ends with why the answer has to be true.",
    ],
    prompts: [
      "Prove the Pythagorean theorem by rearranging squares.",
      "Why are there infinitely many prime numbers?",
      "What is a Fourier series? Build a square wave from circles.",
    ],
  },
];

export function getTopic(slug: string) {
  return TOPICS.find((topic) => topic.slug === slug);
}
