import type { MetadataRoute } from "next";
import { CURATED_VIDEOS } from "@/lib/curated-videos";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const publicPages: MetadataRoute.Sitemap = [
    {
      url: SITE_URL,
      lastModified: new Date("2026-09-13"),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${SITE_URL}/examples`,
      lastModified: new Date("2026-09-13"),
      changeFrequency: "weekly",
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/how-it-works`,
      lastModified: new Date("2026-09-13"),
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/about`,
      lastModified: new Date("2026-09-13"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${SITE_URL}/methodology`,
      lastModified: new Date("2026-09-13"),
      changeFrequency: "monthly",
      priority: 0.7,
    },
  ];

  const videoPages: MetadataRoute.Sitemap = CURATED_VIDEOS.map((video) => ({
    url: `${SITE_URL}/examples/${video.slug}`,
    lastModified: new Date(video.publishedAt),
    changeFrequency: "monthly",
    priority: 0.75,
  }));

  return [...publicPages, ...videoPages];
}
