import type { Metadata, Viewport } from "next";
import { Lexend } from "next/font/google";

import { ClerkProvider } from "@clerk/nextjs";

import "./globals.css";
import ConvexClientProvider from "@/components/providers/ConvexClientProvider";
import { PostHogUserIdentifier } from "@/components/providers/PostHogUserIdentifier";

import { shadcn } from "@clerk/themes";

const defaultFont = Lexend({
  display: "optional",
  subsets: ["latin"],
});

const siteUrl = new URL("https://eduvids.app");
const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      name: "eduvids",
      url: "https://eduvids.app",
      potentialAction: {
        "@type": "SearchAction",
        target: "https://eduvids.app/?q={search_term_string}",
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "SoftwareApplication",
      name: "eduvids",
      applicationCategory: "EducationalApplication",
      operatingSystem: "Web",
      url: "https://eduvids.app",
      description:
        "AI educational video generator that creates accurate visual explanations from text prompts.",
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
  description:
    "Generate high-quality educational videos with code-accurate animations for math, science, and more. Free, multilingual, and simple to use with absolutely no sign-up required.",
  applicationName: "eduvids",
  keywords: [
    "educational videos",
    "AI educational video generator",
    "AI videos for education",
    "text to educational video",
    "math video generator",
    "science video generator",
    "learning videos",
    "youtube shorts education",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "eduvids",
    title: "eduvids | AI Educational Video Generator",
    description:
      "Create accurate educational videos from text prompts for math, science, and more.",
  },
  twitter: {
    card: "summary_large_image",
    title: "eduvids | AI Educational Video Generator",
    description:
      "Create accurate educational videos from text prompts for math, science, and more.",
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
          <ConvexClientProvider>
            <PostHogUserIdentifier />
            <div className="flex flex-col h-svh overflow-hidden">
              <div className="flex-1 overflow-hidden">{children}</div>
            </div>
          </ConvexClientProvider>
        </ClerkProvider>
      </body>
    </html>
  );
}
