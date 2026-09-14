import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, Play } from "lucide-react";

import { getYouTubeThumbnail, type CuratedVideo } from "@/lib/curated-videos";

export function VideoCard({ video }: { video: CuratedVideo }) {
  return (
    <Link
      href={`/examples/${video.slug}`}
      className="group block overflow-hidden rounded-2xl border border-border/70 bg-card/70 transition duration-200 hover:-translate-y-0.5 hover:border-border hover:bg-card"
    >
      <div className="relative aspect-video overflow-hidden bg-black">
        <Image
          src={getYouTubeThumbnail(video.videoId)}
          alt={`Thumbnail for ${video.title}`}
          fill
          sizes="(max-width: 768px) 100vw, 33vw"
          className="object-cover opacity-90 transition duration-500 group-hover:scale-[1.03] group-hover:opacity-100"
        />
        <div className="absolute inset-0 bg-linear-to-t from-black/70 via-transparent to-transparent" />
        <span className="absolute bottom-4 left-4 inline-flex size-10 items-center justify-center rounded-full bg-white text-black shadow-lg transition-transform duration-300 group-hover:scale-110">
          <Play className="ml-0.5 size-4 fill-current" />
        </span>
        <span className="absolute right-4 top-4 rounded-full border border-white/20 bg-black/60 px-3 py-1 text-xs text-white/80 backdrop-blur">
          {video.format}
        </span>
      </div>
      <div className="p-5 sm:p-6">
        <div className="mb-3 flex items-center justify-between gap-4 text-xs text-muted-foreground">
          <span>{video.subject}</span>
          <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </div>
        <h3 className="text-balance text-lg font-semibold leading-snug tracking-tight text-foreground">
          {video.title}
        </h3>
        <p className="mt-3 line-clamp-3 text-sm leading-6 text-muted-foreground">
          {video.description}
        </p>
      </div>
    </Link>
  );
}
