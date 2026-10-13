"use client";

import Image from "next/image";
import Link from "next/link";
import { Sparkles } from "lucide-react";

import {
  CURATED_VIDEOS,
  getYouTubeThumbnail,
  type CuratedVideo,
} from "@/lib/curated-videos";

const GALLERY_SIZE = 4;

// Featured picks first, then the newest of the rest.
const GALLERY = [...CURATED_VIDEOS]
  .sort((a, b) => Number(Boolean(b.featured)) - Number(Boolean(a.featured)))
  .slice(0, GALLERY_SIZE);

export function RemixGallery({
  onRemix,
}: {
  onRemix: (video: CuratedVideo) => void;
}) {
  return (
    <section className="mt-12">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="text-sm font-medium text-foreground">
          Made with eduvids
        </h2>
        <Link
          href="/examples"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          See all
        </Link>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {GALLERY.map((video) => (
          <article
            key={video.videoId}
            className="overflow-hidden rounded-xl border border-border/70 bg-card/70"
          >
            <Link
              href={`/examples/${video.slug}`}
              className="relative block aspect-video bg-black"
            >
              <Image
                src={getYouTubeThumbnail(video.videoId)}
                alt={video.title}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                className="object-cover opacity-90 transition hover:opacity-100"
              />
            </Link>
            <div className="p-3">
              <Link
                href={`/examples/${video.slug}`}
                className="line-clamp-2 text-sm font-medium leading-5 text-foreground hover:underline"
              >
                {video.title}
              </Link>
              <button
                type="button"
                onClick={() => onRemix(video)}
                className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <Sparkles className="size-3.5" />
                Make my own
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
