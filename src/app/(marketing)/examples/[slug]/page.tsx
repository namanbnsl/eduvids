import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { notFound } from "next/navigation";

import { VideoCard } from "@/components/marketing/video-card";
import {
  CURATED_VIDEOS,
  getCuratedVideo,
  getYouTubeThumbnail,
  getYouTubeUrl,
} from "@/lib/curated-videos";
import { SITE_URL, YOUTUBE_CHANNEL_URL } from "@/lib/site";

type PageProps = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return CURATED_VIDEOS.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const video = getCuratedVideo((await params).slug);
  if (!video) return {};

  const path = `/examples/${video.slug}`;
  return {
    title: video.title,
    description: video.description,
    alternates: { canonical: path },
    openGraph: {
      type: "video.other",
      url: path,
      title: `${video.title} | eduvids`,
      description: video.description,
      images: [{ url: getYouTubeThumbnail(video.videoId) }],
      videos: [`https://www.youtube.com/embed/${video.videoId}`],
    },
    twitter: {
      card: "summary_large_image",
      title: `${video.title} | eduvids`,
      description: video.description,
      images: [getYouTubeThumbnail(video.videoId)],
    },
  };
}

export default async function ExamplePage({ params }: PageProps) {
  const video = getCuratedVideo((await params).slug);
  if (!video) notFound();

  const originalUrl = getYouTubeUrl(video);
  const related = CURATED_VIDEOS.filter(
    (candidate) => candidate.slug !== video.slug,
  ).slice(0, 3);
  const videoSchema = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: video.title,
    description: video.description,
    thumbnailUrl: [getYouTubeThumbnail(video.videoId)],
    uploadDate: video.publishedAt,
    embedUrl: `https://www.youtube.com/embed/${video.videoId}`,
    contentUrl: originalUrl,
    url: `${SITE_URL}/examples/${video.slug}`,
    creator: {
      "@type": "Organization",
      name: "eduvids",
      url: SITE_URL,
      sameAs: YOUTUBE_CHANNEL_URL,
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(videoSchema) }}
      />
      <article className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
        <Link
          href="/examples"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> All examples
        </Link>

        <header className="mt-8 max-w-4xl">
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="rounded-full border border-border px-3 py-1.5">
              {video.subject}
            </span>
            <span className="rounded-full border border-border px-3 py-1.5">
              {video.format}
            </span>
          </div>
          <h1 className="mt-5 text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
            {video.title}
          </h1>
          <p className="mt-5 max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
            {video.description}
          </p>
        </header>

        <div className="mt-8 overflow-hidden rounded-2xl border border-border bg-black shadow-2xl">
          <div className="aspect-video">
            <iframe
              className="size-full"
              src={`https://www.youtube-nocookie.com/embed/${video.videoId}`}
              title={video.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              loading="lazy"
            />
          </div>
        </div>

        <div className="mt-6 grid gap-5 border-b border-border/60 pb-12 md:grid-cols-[1fr_auto] md:items-start">
          <p className="max-w-3xl text-sm leading-7 text-muted-foreground">
            Selected from the official eduvids YouTube channel and presented
            here as an example of the product&apos;s output.
          </p>
          <Link
            href={originalUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium hover:border-foreground/30 hover:bg-card"
          >
            Watch on YouTube <ArrowUpRight className="size-4" />
          </Link>
        </div>

        <section className="pt-12">
          <h2 className="text-2xl font-semibold tracking-tight">
            More visual explanations
          </h2>
          <div className="mt-6 grid gap-5 md:grid-cols-3">
            {related.map((item) => (
              <VideoCard key={item.videoId} video={item} />
            ))}
          </div>
        </section>
      </article>
    </>
  );
}
