import Link from "next/link";

import { GITHUB_URL, X_URL, YOUTUBE_CHANNEL_URL } from "@/lib/site";

export function MarketingFooter() {
  return (
    <footer className="border-t border-border/60 bg-background text-foreground">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:px-8 md:grid-cols-[1.3fr_1fr_1fr]">
        <div>
          <Link href="/" className="text-xl font-semibold tracking-tight">
            eduvids
          </Link>
          <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
            A free AI educational video generator for narrated, code-rendered
            math and science explanations.
          </p>
        </div>
        <div className="grid content-start gap-3 text-sm">
          <p className="text-xs font-medium text-muted-foreground">Explore</p>
          <Link
            href="/examples"
            className="text-muted-foreground hover:text-foreground"
          >
            Examples
          </Link>
          <Link
            href="/how-it-works"
            className="text-muted-foreground hover:text-foreground"
          >
            How it works
          </Link>
          <Link
            href="/methodology"
            className="text-muted-foreground hover:text-foreground"
          >
            Methodology
          </Link>
          <Link
            href="/about"
            className="text-muted-foreground hover:text-foreground"
          >
            About
          </Link>
        </div>
        <div className="grid content-start gap-3 text-sm">
          <p className="text-xs font-medium text-muted-foreground">Official</p>
          <a
            href={YOUTUBE_CHANNEL_URL}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground"
          >
            eduvids on YouTube
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground"
          >
            eduvids on GitHub
          </a>
          <a
            href={X_URL}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground hover:text-foreground"
          >
            eduvids on X
          </a>
        </div>
      </div>
      <div className="border-t border-border/60 px-5 py-5 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} eduvids
      </div>
    </footer>
  );
}
