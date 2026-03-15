"use client";
import { Button } from "@/components/ui/button";

interface QuickActionCardsProps {
  onCardClick: (text: string) => void;
  topics?: string[];
  isLoading?: boolean;
}

export function QuickActionCards({
  onCardClick,
  topics,
  isLoading = false,
}: QuickActionCardsProps) {
  const placeholderCount = 1;

  if (isLoading || !topics || topics.length === 0) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
        {Array.from({ length: placeholderCount }).map((_, index) => (
          <div
            key={index}
            className="h-12 w-full flex items-center justify-start px-4 rounded-lg border border-border bg-transparent animate-pulse"
          >
            <div className="h-4 bg-muted rounded w-3/4 animate-shimmer bg-linear-to-r from-muted via-muted-foreground/20 to-muted bg-size-[200%_100%]"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex w-full flex-wrap items-stretch justify-center gap-5">
      {topics.slice(0, 2).map((topic) => (
        <Button
          key={topic}
          variant="outline"
          className="h-auto min-h-11 w-full max-w-[22rem] rounded-full border border-border/70 bg-card/70 px-5 py-3 text-center text-sm font-medium text-foreground shadow-[0_8px_24px_-20px_color-mix(in_oklch,var(--foreground)_45%,transparent)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-accent/70 sm:w-[18rem]"
          onClick={() => onCardClick(topic)}
        >
          <span className="line-clamp-2 text-balance leading-5">{topic}</span>
        </Button>
      ))}
    </div>
  );
}
