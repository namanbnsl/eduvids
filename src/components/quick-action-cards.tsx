"use client";
import { Button } from "@/components/ui/button";

interface QuickActionCardsProps {
  onCardClick: (text: string) => void;
  topics?: string[];
  isLoading?: boolean;
  onboardingId?: string;
}

export function QuickActionCards({
  onCardClick,
  topics,
  isLoading = false,
  onboardingId,
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
    <div className="flex justify-center w-full">
      <Button
        data-onboarding={onboardingId}
        variant="outline"
        className="h-12 w-64 rounded-full border border-border/70 bg-card/70 px-5 text-sm text-foreground shadow-[0_10px_35px_-25px_color-mix(in_oklch,var(--foreground)_55%,transparent)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-accent/70"
        onClick={() => onCardClick(topics[0])}
      >
        {topics[0]}
      </Button>
    </div>
  );
}
