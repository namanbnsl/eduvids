import type { Metadata, Viewport } from "next";
import { Lexend } from "next/font/google";

import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";

// @ts-ignore next-line
import "./globals.css";

const defaultFont = Lexend({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "eduvids - free educational video generator",
  description:
    "Generate high-quality educational videos with code-accurate animations for math, science, and more. Free, multilingual, and simple to use with absolutely no sign-up required.",
  icons: { icon: "/favicon.svg" },
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
      <Analytics />
      <SpeedInsights />
      <body
        className={`${defaultFont.className} antialiased min-h-screen text-foreground`}
      >
        {children}
      </body>
    </html>
  );
}
