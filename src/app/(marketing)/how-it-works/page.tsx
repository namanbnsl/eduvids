import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import { createMarketingMetadata } from "@/lib/site";

export const metadata = createMarketingMetadata({
  title: "How the AI Educational Video Generator Works",
  description:
    "Learn how eduvids turns a text prompt into a narrated educational video with code-rendered diagrams, equations and animation.",
  path: "/how-it-works",
});

const stages = [
  {
    number: "01",
    title: "Define the teaching objective",
    copy: "Describe the concept, audience and depth. A focused prompt gives the lesson a clear question to answer.",
  },
  {
    number: "02",
    title: "Structure the explanation",
    copy: "eduvids plans the ideas and narration from intuition to the formal concept—not a collection of unrelated clips.",
  },
  {
    number: "03",
    title: "Render the visuals",
    copy: "Equations, graphs, diagrams and motion are rendered from code so each scene follows the explanation.",
  },
  {
    number: "04",
    title: "Review the result",
    copy: "Watch the full lesson, check important claims and share it in the format that fits your audience.",
  },
];

export default function HowItWorksPage() {
  return (
    <>
      <section className="border-b border-border/60 px-5 py-16 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <h1 className="max-w-4xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            From one clear prompt to a visual lesson
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
            eduvids is an AI educational video generator built for concepts that
            benefit from diagrams, mathematical notation and motion—not generic
            stock footage.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-18">
        <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {stages.map((stage) => (
            <article key={stage.number} className="bg-background p-6 sm:p-7">
              <span className="text-xs text-muted-foreground">
                {stage.number}
              </span>
              <h2 className="mt-8 min-h-12 text-lg font-semibold leading-snug tracking-tight">
                {stage.title}
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {stage.copy}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-border/60 bg-card/35 px-5 py-14 sm:px-8 sm:py-18">
        <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-2 lg:items-stretch">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              What it is designed for
            </h2>
            <div className="mt-6 space-y-4">
              {[
                "Mathematics and physics concepts",
                "Visual intuition and step-by-step explanations",
                "Landscape lessons and concise vertical Shorts",
              ].map((item) => (
                <p
                  key={item}
                  className="flex items-center gap-3 text-sm text-muted-foreground"
                >
                  <Check className="size-4 text-muted-foreground" /> {item}
                </p>
              ))}
            </div>
          </div>
          <div className="rounded-2xl border border-border bg-background p-7 sm:p-8">
            <h2 className="text-2xl font-semibold tracking-tight">
              Start with a concept
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Try eduvids for free without creating an account. Sign up only if
              you want to save projects and use advanced features.
            </p>
            <Link
              href="/"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition hover:bg-foreground/90"
            >
              Create a video <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
