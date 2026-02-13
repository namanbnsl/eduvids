"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Sparkles } from "lucide-react";

interface OnboardingProps {
  onComplete: (message: string | null, mode: "video" | "short" | null) => void;
}

type TourStep = {
  title: string;
  description: string;
  selectors: string[];
};

const TOUR_STEPS: TourStep[] = [
  {
    title: "Welcome to eduvids",
    description:
      "Generate teaching videos from a single prompt. This quick tour shows where to start.",
    selectors: ['[data-onboarding="hero-title"]'],
  },
  {
    title: "Describe the lesson",
    description:
      "Write exactly what you want explained. Clear prompts produce tighter visuals.",
    selectors: ['[data-onboarding="composer"]'],
  },
  {
    title: "Choose a format",
    description:
      "Use Video for landscape lessons and Short for vertical social-friendly explainers.",
    selectors: ['[data-onboarding="mode-buttons"]', '[data-onboarding="composer"]'],
  },
  {
    title: "Use a starter topic",
    description:
      "Tap a suggested topic if you want a fast first run without writing from scratch.",
    selectors: ['[data-onboarding="topic-suggestion"]', '[data-onboarding="composer"]'],
  },
  {
    title: "Generate",
    description:
      "Submit your prompt and we will produce the full video workflow automatically.",
    selectors: ['[data-onboarding="submit"]', '[data-onboarding="composer"]'],
  },
];

type TargetBox = {
  top: number;
  left: number;
  width: number;
  height: number;
};

function getTarget(selectors: string[]) {
  for (const selector of selectors) {
    const element = document.querySelector(selector) as HTMLElement | null;
    if (!element) {
      continue;
    }

    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return rect;
    }
  }

  return null;
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [targetBox, setTargetBox] = useState<TargetBox | null>(null);
  const [quickStartMode, setQuickStartMode] = useState<"video" | "short">("video");
  const animationFrameRef = useRef<number | null>(null);

  const currentStep = TOUR_STEPS[step];
  const totalSteps = TOUR_STEPS.length;

  useEffect(() => {
    const update = () => {
      const rect = getTarget(currentStep.selectors);
      if (!rect) {
        setTargetBox(null);
        return;
      }

      const padding = 14;
      const width = rect.width + padding * 2;
      const height = rect.height + padding * 2;

      setTargetBox({
        left: Math.max(12, rect.left - padding),
        top: Math.max(12, rect.top - padding),
        width,
        height,
      });
    };

    const scheduleUpdate = () => {
      if (animationFrameRef.current !== null) {
        return;
      }
      animationFrameRef.current = requestAnimationFrame(() => {
        animationFrameRef.current = null;
        update();
      });
    };

    scheduleUpdate();

    const observer = new MutationObserver(scheduleUpdate);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    window.addEventListener("resize", scheduleUpdate, { passive: true });
    window.addEventListener("scroll", scheduleUpdate, { passive: true, capture: true });

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      observer.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", scheduleUpdate, true);
    };
  }, [currentStep]);

  const tooltipStyle = useMemo(() => {
    if (!targetBox) {
      return {
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
      };
    }

    if (typeof window === "undefined") {
      return {
        top: `${targetBox.top}px`,
        left: `${targetBox.left}px`,
        transform: "translate(0, 0)",
      };
    }

    const cardWidth = 360;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const gap = 18;

    let left = targetBox.left;
    let top = targetBox.top + targetBox.height + gap;

    if (left + cardWidth > viewportWidth - 16) {
      left = viewportWidth - cardWidth - 16;
    }

    if (left < 16) {
      left = 16;
    }

    if (top + 220 > viewportHeight - 16) {
      top = Math.max(16, targetBox.top - 220 - gap);
    }

    return {
      top: `${top}px`,
      left: `${left}px`,
      transform: "translate(0, 0)",
    };
  }, [targetBox]);

  const handleNext = () => {
    setStep((prev) => Math.min(totalSteps - 1, prev + 1));
  };

  const handleBack = () => {
    setStep((prev) => Math.max(0, prev - 1));
  };

  const handleFinish = () => {
    onComplete(null, null);
  };

  const handleSkip = () => {
    onComplete(null, null);
  };

  const handleQuickStart = () => {
    const quickStartPrompt =
      quickStartMode === "video"
        ? "Generate a video explaining the Pythagorean theorem with a clean geometric proof"
        : "Generate a short vertical video explaining photosynthesis in 30 seconds";

    onComplete(quickStartPrompt, quickStartMode);
  };

  return (
    <div className="fixed inset-0 z-[120]">
      <div className="absolute inset-0 bg-background/58 backdrop-blur-[2px]" />

      {targetBox && (
        <div
          className="absolute rounded-2xl border border-ring/80 shadow-[0_0_0_9999px_color-mix(in_oklch,var(--background)_58%,transparent)] transition-all duration-300"
          style={{
            top: targetBox.top,
            left: targetBox.left,
            width: targetBox.width,
            height: targetBox.height,
          }}
        >
          <div className="absolute -inset-1 rounded-[1.1rem] border border-foreground/25 animate-pulse" />
        </div>
      )}

      <div
        className="absolute w-[min(360px,calc(100vw-32px))] rounded-2xl border border-border/80 bg-card/95 p-5 text-card-foreground shadow-[0_30px_60px_-40px_color-mix(in_oklch,var(--foreground)_65%,transparent)] backdrop-blur-md transition-all duration-300"
        style={tooltipStyle}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="size-3.5" />
            Onboarding
          </div>
          <button
            onClick={handleSkip}
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            Skip
          </button>
        </div>

        <h2 className="text-base font-semibold leading-tight">{currentStep.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {currentStep.description}
        </p>

        {step === totalSteps - 1 && (
          <div className="mt-4 rounded-xl border border-border/70 bg-muted/45 p-3">
            <p className="mb-2 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
              Quick start mode
            </p>
            <div className="inline-flex rounded-lg border border-border/70 bg-background/70 p-1">
              <button
                onClick={() => setQuickStartMode("video")}
                className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
                  quickStartMode === "video"
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Video
              </button>
              <button
                onClick={() => setQuickStartMode("short")}
                className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
                  quickStartMode === "short"
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Short
              </button>
            </div>
          </div>
        )}

        <div className="mt-5 flex items-center justify-between">
          <div className="flex gap-1.5">
            {TOUR_STEPS.map((_, index) => (
              <div
                key={index}
                className={`h-1.5 rounded-full transition-all ${
                  index === step ? "w-6 bg-foreground" : "w-2 bg-muted-foreground/40"
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleBack}
                className="h-8 rounded-lg px-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
              >
                <ChevronLeft className="size-4" />
              </Button>
            )}

            {step < totalSteps - 1 ? (
              <Button
                size="sm"
                onClick={handleNext}
                className="h-8 rounded-lg bg-foreground px-3 text-background hover:bg-foreground/90"
              >
                Next
                <ChevronRight className="size-4" />
              </Button>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleQuickStart}
                  className="h-8 rounded-lg px-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                >
                  Quick start
                </Button>
                <Button
                  size="sm"
                  onClick={handleFinish}
                  className="h-8 rounded-lg bg-foreground px-3 text-background hover:bg-foreground/90"
                >
                  Finish
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
