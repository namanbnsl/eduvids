import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { getVideosForTopic } from "@/lib/curated-videos";
import { createMarketingMetadata } from "@/lib/site";
import { TOPICS } from "@/lib/topics";

export const metadata: Metadata = createMarketingMetadata({
  title: "Topics: Math, Physics and Chemistry Explained Visually",
  description:
    "Browse free animated explainers by subject: calculus, probability, chemistry, physics and mathematics. Watch examples or generate your own video.",
  path: "/topics",
});

export default function TopicsPage() {
  return (
    <>
      <section className="border-b border-border/60 px-5 py-16 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <h1 className="max-w-4xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            Explained visually, by topic
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
            Narrated, code-rendered explainers grouped by subject. Each topic
            has example videos and ideas you can turn into your own.
          </p>
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
          {TOPICS.map((topic) => {
            const count = getVideosForTopic(topic.slug).length;
            return (
              <Link
                key={topic.slug}
                href={`/topics/${topic.slug}`}
                className="group bg-background p-6 transition hover:bg-card sm:p-7"
              >
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    {count} {count === 1 ? "video" : "videos"}
                  </span>
                  <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                </div>
                <h2 className="mt-8 text-lg font-semibold tracking-tight">
                  {topic.name}
                </h2>
                <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">
                  {topic.intro[0]}
                </p>
              </Link>
            );
          })}
        </div>
      </section>
    </>
  );
}
