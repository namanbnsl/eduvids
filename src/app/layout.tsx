import type { Metadata, Viewport } from "next";
import { Lexend } from "next/font/google";

import { ClerkProvider } from "@clerk/nextjs";

import { shadcn } from "@clerk/themes";
import {
  GITHUB_URL,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
  X_URL,
  YOUTUBE_CHANNEL_URL,
} from "@/lib/site";
import "./globals.css";

const defaultFont = Lexend({
  display: "optional",
  subsets: ["latin"],
});

const siteUrl = new URL(SITE_URL);
const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: SITE_NAME,
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      url: SITE_URL,
      logo: `${SITE_URL}/favicon.png`,
      sameAs: [YOUTUBE_CHANNEL_URL, X_URL, GITHUB_URL],
    },
    {
      "@type": "SoftwareApplication",
      "@id": `${SITE_URL}/#application`,
      name: "eduvids",
      applicationCategory: "EducationalApplication",
      operatingSystem: "Web",
      url: SITE_URL,
      description: SITE_DESCRIPTION,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
    },
  ],
};

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: {
    default: "eduvids | AI Educational Video Generator",
    template: "%s | eduvids",
  },
  description: SITE_DESCRIPTION,
  applicationName: "eduvids",
  keywords: [
    "educational videos",
    "AI educational video generator",
    "AI videos for education",
    "text to educational video",
    "math video generator",
    "science video generator",
    "learning videos",
    "educational animation generator",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "eduvids",
    title: "eduvids | AI Educational Video Generator",
    description: SITE_DESCRIPTION,
    images: [{ url: "/opengraph-image", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "eduvids | AI Educational Video Generator",
    description: SITE_DESCRIPTION,
    images: ["/twitter-image"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: { icon: "/favicon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${defaultFont.className} antialiased min-h-screen text-foreground dark md:overflow-hidden lg:overflow-hidden`}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        <ClerkProvider appearance={{ theme: shadcn }}>
          <div className="flex h-svh flex-col overflow-hidden">
            <div className="flex-1 overflow-hidden">{children}</div>
          </div>
        </ClerkProvider>
      </body>
    </html>
  );
}
