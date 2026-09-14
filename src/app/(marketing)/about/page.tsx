import Link from "next/link";
import { ArrowRight, Github, Youtube } from "lucide-react";

import {
  createMarketingMetadata,
  GITHUB_URL,
  YOUTUBE_CHANNEL_URL,
} from "@/lib/site";

export const metadata = createMarketingMetadata({
  title: "About",
  description:
    "eduvids is an open-source AI educational video generator that turns text prompts into narrated visual explanations.",
  path: "/about",
});

export default function AboutPage() {
  return (
    <section className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
      <h1 className="max-w-4xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
        Make difficult ideas easier to see
      </h1>
      <div className="mt-10 grid gap-8 border-t border-border/60 pt-10 lg:grid-cols-[0.55fr_1.45fr]">
        <h2 className="text-lg font-semibold">Why eduvids exists</h2>
        <div className="space-y-5 text-base leading-7 text-muted-foreground">
          <p>
            eduvids is an AI educational video generator for creating narrated
            visual explanations from a text prompt. It focuses on code-rendered
            diagrams, equations and animation that can follow the structure of a
            lesson.
          </p>
          <p>
            The project is free to try and open source. The public examples
            library is a curated selection from the official eduvids YouTube
            channel; it is not an automatic feed of every generated video.
          </p>
          <p>
            The goal is not to replace teachers or subject-matter experts. It is
            to make visual explanation faster to produce, easier to explore and
            more accessible to people who learn by seeing ideas move.
          </p>
        </div>
      </div>
      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/#create"
          className="inline-flex items-center gap-2 rounded-lg bg-foreground px-4 py-2.5 text-sm font-semibold text-background hover:bg-foreground/90"
        >
          Try eduvids <ArrowRight className="size-4" />
        </Link>
        <Link
          href={YOUTUBE_CHANNEL_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-card"
        >
          <Youtube className="size-4" /> YouTube
        </Link>
        <Link
          href={GITHUB_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:bg-card"
        >
          <Github className="size-4" /> Open source
        </Link>
      </div>
    </section>
  );
}
