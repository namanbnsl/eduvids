import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/chat/", "/sign-in", "/sign-up"],
      },
    ],
    sitemap: "https://eduvids.app/sitemap.xml",
    host: "https://eduvids.app",
  };
}
