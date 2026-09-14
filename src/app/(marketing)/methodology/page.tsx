import { createMarketingMetadata } from "@/lib/site";

export const metadata = createMarketingMetadata({
  title: "Content Methodology",
  description:
    "How eduvids curates public examples and communicates the limits of AI-generated educational content.",
  path: "/methodology",
});

const principles = [
  {
    title: "Editorial selection",
    copy: "The examples library is maintained as an explicit list. New public generations do not become indexed example pages automatically.",
  },
  {
    title: "Traceable originals",
    copy: "Each example identifies the official eduvids channel as its host and links directly to the original YouTube video.",
  },
  {
    title: "Clear disclosure",
    copy: "Pages identify the videos as AI-generated and remind viewers to verify important claims against authoritative sources.",
  },
  {
    title: "Search integrity",
    copy: "Titles and descriptions state what a page actually contains. We avoid fabricated reviews, performance claims and unsupported superlatives.",
  },
];

export default function MethodologyPage() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
      <h1 className="max-w-4xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
        Curated examples, explicit provenance
      </h1>
      <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
        eduvids creates educational media with AI. These principles govern the
        examples we present as representative public work.
      </p>
      <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-border bg-border md:grid-cols-2">
        {principles.map((principle) => (
          <article key={principle.title} className="bg-background p-7 sm:p-8">
            <h2 className="text-xl font-semibold tracking-tight">
              {principle.title}
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {principle.copy}
            </p>
          </article>
        ))}
      </div>
      <div className="mt-8 rounded-2xl border border-border bg-card/50 p-7 sm:p-8">
        <h2 className="text-xl font-semibold">Accuracy note</h2>
        <p className="mt-3 max-w-4xl text-sm leading-6 text-muted-foreground">
          AI-generated explanations may contain factual, mathematical or
          pedagogical errors. Review material before relying on it in a
          classroom, assessment, publication or other high-stakes setting.
        </p>
      </div>
    </section>
  );
}
