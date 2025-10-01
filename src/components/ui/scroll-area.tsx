import * as React from "react";
import { cn } from "@/lib/utils";

export function ScrollArea({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden",
        className
      )}
    >
      <div className="h-full w-full overflow-y-auto [scrollbar-width:thin] [scrollbar-color:theme(colors.zinc.400)_transparent]">
        {children}
      </div>
    </div>
  );
}

