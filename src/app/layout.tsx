import type { Metadata, Viewport } from "next";
import { Roboto_Mono } from "next/font/google";

import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import { ConvexClientProvider } from "@/components/providers/ConvexClientProvider";

// @ts-ignore next-line
import "./globals.css";

const defaultFont = Roboto_Mono({
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const stored = localStorage.getItem('theme');
                  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  const shouldBeDark = stored ? stored === 'dark' : prefersDark;
                  
                  if (shouldBeDark) {
                    document.documentElement.classList.add('dark');
                  }
                  
                  // Signal that theme is ready
                  window.__themeReady = true;
                } catch (e) {
                  console.error('Theme initialization error:', e);
                  window.__themeReady = true;
                }
              })();
            `,
          }}
        />
      </head>
      <Analytics />
      <SpeedInsights />
      <ConvexClientProvider>
        <body
          className={`${defaultFont.className} antialiased min-h-screen text-foreground`}
        >
          {children}
        </body>
      </ConvexClientProvider>
    </html>
  );
}
