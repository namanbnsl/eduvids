"use client";

import { ExternalLink, Globe, ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import type { WebSource } from "@/lib/types";
import { useState } from "react";

interface SourcesProps {
  sources: WebSource[];
  className?: string;
}

function getDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace("www.", "");
  } catch {
    return url;
  }
}

function SourceItem({ source }: { source: WebSource }) {
  return (
    <HoverCard openDelay={200} closeDelay={100}>
      <HoverCardTrigger asChild>
        <a
          href={source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors text-sm group"
        >
          <Globe className="size-4 text-muted-foreground shrink-0" />
          <span className="truncate font-medium">{source.title}</span>
          <ExternalLink className="size-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </a>
      </HoverCardTrigger>
      <HoverCardContent className="w-80" side="top" align="start">
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <Globe className="size-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="space-y-1 min-w-0">
              <h4 className="font-semibold text-sm leading-tight">
                {source.title}
              </h4>
              <p className="text-xs text-muted-foreground">
                {getDomain(source.url)}
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground line-clamp-4">
            {source.content}
          </p>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}

export function Sources({ sources, className }: SourcesProps) {
  const [isOpen, setIsOpen] = useState(false);

  if (!sources || sources.length === 0) {
    return null;
  }

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger
        className={cn(
          "flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer",
          className,
        )}
      >
        <Globe className="size-4" />
        <span>
          {sources.length} source{sources.length !== 1 ? "s" : ""} used
        </span>
        <ChevronDown
          className={cn("size-4 transition-transform", isOpen && "rotate-180")}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3">
        <div className="flex flex-wrap gap-2">
          {sources.map((source, index) => (
            <SourceItem key={`${source.url}-${index}`} source={source} />
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
