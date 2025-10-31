import type { Metadata, Viewport } from "next";
import { Roboto_Mono } from "next/font/google";
import "./globals.css";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";

const defaultFont = Roboto_Mono({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "eduvids",
  description: "Educational Video Generator.",
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
      <body
        className={`${defaultFont.className} antialiased min-h-screen text-[var(--foreground)]`}
      >
        {children}
      </body>
    </html>
  );
}
