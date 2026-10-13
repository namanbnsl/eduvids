import type { StoryboardScene } from "@/lib/types";

export function StoryboardCard({ scenes }: { scenes: StoryboardScene[] }) {
  if (scenes.length === 0) return null;

  return (
    <div className="max-w-3xl rounded-lg border border-border/70 bg-background/70 px-4 py-3 shadow-sm">
      <p className="text-sm font-medium text-foreground">The plan</p>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {scenes.length} {scenes.length === 1 ? "scene" : "scenes"}, being drawn
        now
      </p>
      <ol className="mt-3 max-h-72 space-y-2.5 overflow-y-auto pr-1">
        {scenes.map((scene, index) => (
          <li key={index} className="flex gap-3 text-sm">
            <span className="w-5 shrink-0 pt-px text-right text-xs tabular-nums text-muted-foreground">
              {index + 1}
            </span>
            <div className="min-w-0">
              {scene.chapter && (
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {scene.chapter}
                </p>
              )}
              <p className="leading-6 text-foreground/90">{scene.caption}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
