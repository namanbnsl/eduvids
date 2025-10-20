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
  const placeholderCount = 2;

  if (isLoading || !topics || topics.length === 0) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
        {Array.from({ length: placeholderCount }).map((_, index) => (
          <div
            key={index}
            className="h-12 w-full flex items-center justify-start px-4 rounded-lg border border-border bg-transparent animate-pulse"
          >
            <div className="h-4 bg-muted rounded w-3/4 animate-shimmer bg-gradient-to-r from-muted via-muted-foreground/20 to-muted bg-[length:200%_100%]"></div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
      {topics.map((topic, index) => (
        <Button
          key={index}
          variant="outline"
          className="h-12 w-full flex items-center justify-start px-4 rounded-lg border border-border hover:bg-accent hover:text-accent-foreground transition-colors bg-transparent text-sm text-foreground"
          onClick={() => onCardClick(topic)}
        >
          {topic}
        </Button>
      ))}
    </div>
  );
}
