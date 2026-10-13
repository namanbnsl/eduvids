import { CURATED_TRANSCRIPTS } from "./curated-transcripts";
import type { TopicSlug } from "./topics";

export type CuratedVideo = {
  slug: string;
  videoId: string;
  title: string;
  description: string;
  subject: "Mathematics" | "Physics" | "Chemistry" | "Probability";
  format: "Video" | "Short";
  publishedAt: string;
  /** Topic hubs this video is listed on (see `src/lib/topics.ts`). */
  topics: TopicSlug[];
  /** Starting prompt for "Make your own" on this video. */
  prompt: string;
  /** Plain-text narration, from `scripts/youtube/export-transcripts.ts`. */
  transcript?: string;
  featured?: boolean;
};

// Editorially selected from the official eduvids YouTube channel.
// Keeping this list explicit prevents raw, unreviewed community generations from
// becoming public site pages automatically.
export const CURATED_VIDEOS: CuratedVideo[] = [
  {
    slug: "why-carbon-builds-organic-chemistry",
    videoId: "EbyO-bgEnM0",
    title: "Why Carbon Builds All of Organic Chemistry",
    description:
      "See how carbon’s four valence electrons let it form stable chains, rings and double bonds, the backbone behind every molecule in organic chemistry.",
    subject: "Chemistry",
    format: "Video",
    publishedAt: "2026-10-13T00:00:00Z",
    topics: ["chemistry"],
    prompt:
      "Why can carbon form so many different molecules? Show its four bonds building chains, rings and double bonds.",
    featured: true,
  },
  {
    slug: "why-chemical-bonds-glow-without-heat",
    videoId: "cSnrCTN_o48",
    title: "Why Chemical Bonds Glow Without Any Heat",
    description:
      "Chemiluminescence explained visually: how a reaction leaves electrons in an excited state, and why they give that energy back as light instead of heat.",
    subject: "Chemistry",
    format: "Video",
    publishedAt: "2026-10-13T00:00:00Z",
    topics: ["chemistry"],
    prompt:
      "How does a glow stick make light without getting hot? Explain chemiluminescence step by step.",
    featured: true,
  },
  {
    slug: "why-area-under-probability-curve-equals-one",
    videoId: "EL--ACMS2x8",
    title: "Why the Area Under a Curve Equals 1",
    description:
      "Why every probability density curve encloses an area of exactly 1, and how area under the curve becomes probability for a continuous random variable.",
    subject: "Probability",
    format: "Video",
    publishedAt: "2026-10-13T00:00:00Z",
    topics: ["probability", "calculus"],
    prompt:
      "Why must the total area under a probability density curve equal 1?",
    featured: true,
  },
  {
    slug: "overlapping-events-inclusion-exclusion",
    videoId: "7yo13GlUhKo",
    title: "Why Overlapping Events Break Naive Addition",
    description:
      "Why P(A or B) is not simply P(A) + P(B) when events overlap, and how the inclusion–exclusion principle removes the outcomes counted twice.",
    subject: "Probability",
    format: "Video",
    publishedAt: "2026-10-13T00:00:00Z",
    topics: ["probability"],
    prompt:
      "Why isn't P(A or B) just P(A) + P(B)? Show inclusion–exclusion with overlapping circles.",
  },
  {
    slug: "what-is-an-integral-explained-visually",
    videoId: "q9PI-TLRUow",
    title: "What Is an Integral? Calculus Explained Visually",
    description:
      "See how Riemann sums turn infinitely thin slices into area, then connect that idea to antiderivatives through the fundamental theorem of calculus.",
    subject: "Mathematics",
    format: "Short",
    publishedAt: "2026-09-11T17:52:32Z",
    topics: ["mathematics", "calculus"],
    prompt:
      "What is an integral? Build it from thinner and thinner rectangles under a curve.",
  },
  {
    slug: "navier-stokes-equations-from-scratch",
    videoId: "ojDNu_YYGYk",
    title: "Navier–Stokes Equations From Scratch",
    description:
      "Build the Navier–Stokes equations from conservation laws and see how pressure, viscosity and acceleration describe the motion of a fluid.",
    subject: "Physics",
    format: "Video",
    publishedAt: "2026-09-11T17:41:29Z",
    topics: ["physics"],
    prompt:
      "Derive the Navier–Stokes equations from conservation of mass and momentum.",
  },
  {
    slug: "geometry-of-hyperbolic-space-explained",
    videoId: "k2JPMU85-tI",
    title: "The Geometry of Hyperbolic Space Explained",
    description:
      "Enter the Poincaré disk and learn how negative curvature changes parallel lines, triangle angles, distance and tessellations.",
    subject: "Mathematics",
    format: "Video",
    publishedAt: "2026-09-11T17:45:21Z",
    topics: ["mathematics"],
    prompt:
      "What does hyperbolic space look like? Explore the Poincaré disk and its triangles.",
  },
  {
    slug: "complex-integration-from-first-principles",
    videoId: "rKyIAsPASd0",
    title: "Complex Integration Visualized From First Principles",
    description:
      "Extend integration into the complex plane using paths, parameterization, Cauchy’s theorem and the residue theorem.",
    subject: "Mathematics",
    format: "Video",
    publishedAt: "2026-09-12T03:03:38Z",
    topics: ["mathematics", "calculus"],
    prompt:
      "Explain integration along a path in the complex plane, up to the residue theorem.",
  },
  {
    slug: "chaos-of-a-double-pendulum",
    videoId: "BSRKURy2BBs",
    title: "The Chaos of a Double Pendulum Explained",
    description:
      "Watch two nearly identical double pendulums rapidly diverge and discover why tiny differences make chaotic systems difficult to predict.",
    subject: "Physics",
    format: "Short",
    publishedAt: "2026-09-13T10:53:04Z",
    topics: ["physics"],
    prompt:
      "Why does a double pendulum become unpredictable? Compare two that start almost the same.",
  },
  {
    slug: "gravitational-waves-stretch-spacetime",
    videoId: "NnP7IHBqYKc",
    title: "How Gravitational Waves Stretch Spacetime",
    description:
      "Visualize ripples in spacetime, plus and cross polarizations, and the laser interferometers used to detect extraordinarily small changes in distance.",
    subject: "Physics",
    format: "Video",
    publishedAt: "2026-09-13T11:08:33Z",
    topics: ["physics"],
    prompt:
      "How do gravitational waves stretch space, and how does LIGO detect them?",
  },
  {
    slug: "seven-million-dollar-math-problems",
    videoId: "RURzyD7dOVA",
    title: "The Seven Math Problems Worth $1,000,000",
    description:
      "Tour the Millennium Prize Problems and the open questions connecting prime numbers, computation, geometry, fluids and quantum physics.",
    subject: "Mathematics",
    format: "Video",
    publishedAt: "2026-09-12T05:49:31Z",
    topics: ["mathematics"],
    prompt: "Give a visual tour of the seven Millennium Prize Problems.",
  },
  {
    slug: "pigeonhole-principle-explained-with-socks",
    videoId: "0yK-0cJn8xs",
    title: "The Pigeonhole Principle Explained With Socks",
    description:
      "Use familiar examples to understand why placing more objects than containers guarantees that at least one container holds multiple objects.",
    subject: "Mathematics",
    format: "Video",
    publishedAt: "2026-09-11T17:31:06Z",
    topics: ["mathematics"],
    prompt:
      "Explain the pigeonhole principle with socks in a drawer, then a surprising use of it.",
  },
];

export function getCuratedVideo(slug: string) {
  return CURATED_VIDEOS.find((video) => video.slug === slug);
}

export function getTranscript(video: CuratedVideo): string | undefined {
  return video.transcript ?? CURATED_TRANSCRIPTS[video.videoId];
}

export function getVideosForTopic(topic: TopicSlug) {
  return CURATED_VIDEOS.filter((video) => video.topics.includes(topic));
}

/** Home-page link that opens the generator with a prompt filled in. */
export function getCreateHref(
  prompt: string,
  mode: "video" | "short" = "video",
) {
  return `/?${new URLSearchParams({ prompt, mode })}`;
}

export function getRemixHref(video: CuratedVideo) {
  return getCreateHref(
    video.prompt,
    video.format === "Short" ? "short" : "video",
  );
}

export function getYouTubeThumbnail(videoId: string) {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export function getYouTubeUrl(video: CuratedVideo) {
  const path = video.format === "Short" ? "shorts" : "watch?v=";
  return video.format === "Short"
    ? `https://www.youtube.com/${path}/${video.videoId}`
    : `https://www.youtube.com/${path}${video.videoId}`;
}
