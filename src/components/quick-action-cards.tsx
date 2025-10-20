"use client";
import { Button } from "@/components/ui/button";

interface QuickActionCardsProps {
  onCardClick: (text: string) => void;
}

const cards = [
  {
    description: "Help me brainstorm and develop ideas",
  },
  {
    description: "Explain complex topics in simple terms",
  },
];

export function QuickActionCards({ onCardClick }: QuickActionCardsProps) {
  return (
    <div className="flex flex-col gap-3 w-full">
      {cards.map((card, index) => (
        <Button
          key={index}
          variant="outline"
          className="h-12 w-full flex items-center justify-start px-4 rounded-lg border border-border hover:bg-accent hover:text-accent-foreground transition-colors bg-transparent text-sm text-foreground"
          onClick={() => onCardClick(card.description)}
        >
          {card.description}
        </Button>
      ))}
    </div>
  );
}
