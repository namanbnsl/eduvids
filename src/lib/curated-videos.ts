export type CuratedVideo = {
  slug: string;
  videoId: string;
  title: string;
  description: string;
  subject: "Mathematics" | "Physics" | "Chemistry" | "Probability";
  format: "Video" | "Short";
  publishedAt: string;
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
  },
];

export function getCuratedVideo(slug: string) {
  return CURATED_VIDEOS.find((video) => video.slug === slug);
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
