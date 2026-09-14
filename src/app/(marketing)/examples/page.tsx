import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { VideoCard } from "@/components/marketing/video-card";
import { CURATED_VIDEOS } from "@/lib/curated-videos";
import {
  createMarketingMetadata,
  SITE_URL,
  YOUTUBE_CHANNEL_URL,
} from "@/lib/site";

export const metadata: Metadata = createMarketingMetadata({
  title: "AI-Generated Educational Video Examples",
  description:
    "Watch curated math and physics explainers created with eduvids, an AI educational video generator for narrated visual lessons.",
  path: "/examples",
});

export default function ExamplesPage() {
  const collectionSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "eduvids educational video examples",
    url: `${SITE_URL}/examples`,
    description: metadata.description,
    hasPart: CURATED_VIDEOS.map((video) => ({
      "@type": "VideoObject",
      name: video.title,
      url: `${SITE_URL}/examples/${video.slug}`,
      thumbnailUrl: `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`,
      uploadDate: video.publishedAt,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(collectionSchema) }}
      />
      <section className="border-b border-border/60 px-5 py-16 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="grid gap-6 lg:grid-cols-[1fr_0.55fr] lg:items-end">
            <h1 className="max-w-4xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
              Educational videos made with eduvids
            </h1>
            <div>
              <p className="text-sm leading-6 text-muted-foreground">
                A hand-selected set of visual explanations from the official
                eduvids channel. Every page identifies its source and links to
                the original video.
              </p>
              <Link
                href={YOUTUBE_CHANNEL_URL}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Visit the official channel <ArrowUpRight className="size-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {CURATED_VIDEOS.map((video) => (
            <VideoCard key={video.videoId} video={video} />
          ))}
        </div>
      </section>
    </>
  );
}
