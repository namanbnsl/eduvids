export const SITE_URL = "https://www.eduvids.app";
export const SITE_NAME = "eduvids";
export const YOUTUBE_CHANNEL_URL = "https://www.youtube.com/@eduvids-ai";
export const X_URL = "https://x.com/eduvidsai";
export const GITHUB_URL = "https://github.com/namanbnsl/eduvids";

export const SITE_DESCRIPTION =
  "eduvids is a free AI educational video generator for narrated, code-rendered math and science explanations. Create a landscape video or vertical Short from one prompt.";

export function createMarketingMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: `/${string}`;
}): Metadata {
  const socialTitle = `${title} | eduvids`;

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      url: path,
      siteName: SITE_NAME,
      title: socialTitle,
      description,
      images: [
        {
          url: "/opengraph-image",
          width: 1200,
          height: 630,
          alt: "eduvids — AI educational videos, made clear",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
      images: ["/twitter-image"],
    },
  };
}
import type { Metadata } from "next";
