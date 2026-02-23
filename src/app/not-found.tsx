import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Play } from "lucide-react";

export default function NotFound() {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden px-4">
      {/* Background effects matching the app theme */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute inset-0 bg-[radial-gradient(1200px_500px_at_30%_0%,color-mix(in_oklch,var(--foreground)_8%,transparent),transparent_62%),radial-gradient(1000px_420px_at_85%_100%,color-mix(in_oklch,var(--accent)_70%,transparent),transparent_70%)]" />
        <div className="absolute inset-0 opacity-[0.18] [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:40px_40px]" />
      </div>

      {/* Floating decorative orbs */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/4 top-1/4 size-64 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-20 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklch, var(--accent) 60%, transparent), transparent 70%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-1/4 right-1/4 size-80 translate-x-1/2 translate-y-1/2 rounded-full opacity-15 blur-3xl"
        style={{
          background:
            "radial-gradient(circle, color-mix(in oklch, var(--foreground) 30%, transparent), transparent 70%)",
        }}
      />

      {/* Content */}
      <div className="relative flex flex-col items-center text-center">
        {/* Large 404 with gradient text */}
        <div className="relative mb-2 select-none">
          <span className="block text-[10rem] font-bold leading-none tracking-tighter text-foreground/[0.04] sm:text-[14rem]">
            404
          </span>
          <span className="absolute inset-0 flex items-center justify-center text-7xl font-bold tracking-tighter text-foreground sm:text-8xl">
            4
            <span className="relative mx-1 inline-flex items-center justify-center">
              <span className="absolute size-14 animate-pulse rounded-full bg-accent/30 blur-md sm:size-16" />
              <Play className="relative size-10 fill-foreground text-foreground sm:size-12" />
            </span>
            4
          </span>
        </div>

        <h1 className="mb-3 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          This scene doesn&apos;t exist
        </h1>

        <p className="mx-auto mb-8 max-w-md text-sm leading-relaxed text-muted-foreground sm:text-base">
          Looks like this video never made it to the timeline. Let&apos;s get
          you back to creating something amazing.
        </p>

        <Link href="/">
          <Button size="lg" className="gap-2">
            <ArrowLeft className="size-4" />
            Back to Home
          </Button>
        </Link>
      </div>
    </div>
  );
}
