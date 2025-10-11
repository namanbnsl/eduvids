import { cn } from "@/lib/utils";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

type VideoProgressCardProps = {
  title?: string;
  subtitle?: string;
  stepLabel?: string;
  progress?: number; // 0-100
  eta?: string;
  className?: string;
};

export function VideoProgressCard({
  title,
  subtitle,
  stepLabel,
  progress = 0,
  eta,
  className,
}: VideoProgressCardProps) {
  const clamped = Math.max(0, Math.min(100, progress));

  return (
    <Card
      className={cn(
        "w-full max-w-xl rounded-xl border bg-card text-card-foreground shadow-sm",
        className
      )}
      aria-live="polite"
    >
      <CardHeader className="space-y-2 text-center">
        <CardTitle className="text-balance text-xl font-semibold tracking-tight">
          {title}
        </CardTitle>
        <CardDescription className="mx-auto text-pretty">
          {subtitle}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Progress bar */}
        <div className="rounded-md bg-secondary p-1">
          <Progress
            value={clamped}
            className="h-2 rounded bg-secondary"
            aria-label={subtitle}
          />
        </div>

        {/* Meta row: step label on left, percent on right */}
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span className="truncate">{stepLabel}</span>
          <span className="tabular-nums font-medium text-foreground">
            {clamped}%
          </span>
        </div>

        {/* ETA chip below for breathing room */}
        <div className="pt-1 text-center">
          <span className="inline-flex items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
            <span
              className="h-1.5 w-1.5 rounded-full bg-primary"
              aria-hidden="true"
            />
            <span className="tabular-nums">{eta}</span>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
