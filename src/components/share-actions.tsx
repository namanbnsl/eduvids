"use client";

import { useState } from "react";
import posthog from "posthog-js";
import { Check, Link2, Star } from "lucide-react";

import { Icons } from "@/components/ui/icons";
import { GITHUB_URL } from "@/lib/site";

const XLogo = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="size-3.5 fill-current">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const buttonClass =
  "inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium transition-colors hover:bg-secondary";

function shareText(topic: string) {
  const clean = topic.replace(/\s+/g, " ").trim();
  const short = clean.length > 80 ? `${clean.slice(0, 77)}…` : clean;
  return short
    ? `I made a video on “${short}” with @eduvidsai`
    : "I made this video with @eduvidsai";
}

export function ShareActions({ url, topic }: { url: string; topic: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      posthog.capture("video_share", { channel: "copy_link" });
    } catch {}
  };

  const intent = `https://x.com/intent/post?${new URLSearchParams({
    text: shareText(topic),
    url,
  })}`;

  return (
    <div className="max-w-3xl space-y-3">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={copy} className={buttonClass}>
          {copied ? <Check className="size-4" /> : <Link2 className="size-4" />}
          {copied ? "Copied" : "Copy link"}
        </button>
        <a
          href={intent}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => posthog.capture("video_share", { channel: "x" })}
          className={buttonClass}
        >
          <XLogo />
          Post on X
        </a>
      </div>
      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => posthog.capture("github_star_click")}
        className="group flex items-center gap-3 rounded-lg border border-border/70 bg-background/70 px-4 py-3 text-sm shadow-sm transition-colors hover:border-border"
      >
        <Icons.gitHub className="size-4 shrink-0" />
        <span className="text-muted-foreground">
          eduvids is open source.{" "}
          <span className="text-foreground">Star it on GitHub</span>
        </span>
        <Star className="ml-auto size-4 text-muted-foreground transition-colors group-hover:fill-yellow-400 group-hover:text-yellow-400" />
      </a>
    </div>
  );
}
