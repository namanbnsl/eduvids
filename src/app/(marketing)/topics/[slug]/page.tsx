import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { notFound } from "next/navigation";

import { VideoCard } from "@/components/marketing/video-card";
import { getCreateHref, getVideosForTopic } from "@/lib/curated-videos";
import { createMarketingMetadata, SITE_URL } from "@/lib/site";
import { getTopic, TOPICS } from "@/lib/topics";

type PageProps = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return TOPICS.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const topic = getTopic((await params).slug);
  if (!topic) return {};
  return createMarketingMetadata({
    title: topic.title,
    description: topic.description,
    path: `/topics/${topic.slug}`,
  });
}

export default async function TopicPage({ params }: PageProps) {
  const topic = getTopic((await params).slug);
  if (!topic) notFound();

  const videos = getVideosForTopic(topic.slug);
  const url = `${SITE_URL}/topics/${topic.slug}`;
  const schema = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: topic.title,
      url,
      description: topic.description,
      about: topic.name,
      hasPart: videos.map((video) => ({
        "@type": "VideoObject",
        name: video.title,
        description: video.description,
        url: `${SITE_URL}/examples/${video.slug}`,
        thumbnailUrl: `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`,
        uploadDate: video.publishedAt,
      })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          name: "Topics",
          item: `${SITE_URL}/topics`,
        },
        { "@type": "ListItem", position: 2, name: topic.name, item: url },
      ],
    },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
      />
      <section className="border-b border-border/60 px-5 py-16 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <Link
            href="/topics"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-4" /> All topics
          </Link>
          <h1 className="mt-8 max-w-4xl text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            {topic.title}
          </h1>
          <div className="mt-5 max-w-3xl space-y-4 text-base leading-7 text-muted-foreground sm:text-lg">
            {topic.intro.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
        <h2 className="text-2xl font-semibold tracking-tight">
          {topic.name} videos made with eduvids
        </h2>
        <div className="mt-6 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {videos.map((video) => (
            <VideoCard key={video.videoId} video={video} />
          ))}
        </div>
      </section>

      <section className="border-t border-border/60 bg-card/35 px-5 py-12 sm:px-8 sm:py-16">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-2xl font-semibold tracking-tight">
            Make your own {topic.name.toLowerCase()} video
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Free, no account needed. Pick an idea or write your own.
          </p>
          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {topic.prompts.map((prompt) => (
              <Link
                key={prompt}
                href={getCreateHref(prompt)}
                className="group flex items-start justify-between gap-4 rounded-xl border border-border bg-background p-5 text-sm leading-6 transition hover:border-foreground/30"
              >
                <span>{prompt}</span>
                <ArrowRight className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
