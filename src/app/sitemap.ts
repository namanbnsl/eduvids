import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://eduvids.app",
      lastModified: new Date("2026-02-23"),
      changeFrequency: "daily",
      priority: 1,
    },
  ];
}
