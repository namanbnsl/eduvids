"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  MonitorPlay,
  Smartphone,
  Sparkles,
  Type,
  Zap,
  MousePointerClick,
  Play,
} from "lucide-react";

interface OnboardingProps {
  onComplete: (message: string | null, mode: "video" | "short" | null) => void;
}

type TourStep = {
  title: string;
  description: string;
  icon: React.ReactNode;
  selectors: string[];
};

const TOUR_STEPS: TourStep[] = [
  {
    title: "Welcome to eduvids 👋",
    description:
      "eduvids turns any topic into a fully produced educational video — complete with animations, narration, and visuals. No editing skills needed. Let's walk through how it works.",
    icon: <Sparkles className="size-4" />,
    selectors: ['[data-onboarding="hero-title"]'],
  },
  {
    title: "Type what you want to learn",
    description:
      'This is where you describe your video. Just type a clear topic, like "How gravity works" or "The water cycle explained". One sentence is all it takes — we handle the rest.',
    icon: <Type className="size-4" />,
    selectors: ['[data-onboarding="composer"]'],
  },
  {
    title: "Pick your format",
    description:
      "Choose Video for a standard horizontal lesson (great for YouTube or presentations), or Short for a vertical clip optimised for phones (like TikTok or Instagram Reels).",
    icon: <MonitorPlay className="size-4" />,
    selectors: ['[data-onboarding="mode-buttons"]'],
  },
  {
    title: "Try a suggested topic",
    description:
      "Not sure what to type? Click a suggested topic and we'll fill in the prompt for you automatically. It's a great way to see what eduvids can do.",
    icon: <MousePointerClick className="size-4" />,
    selectors: ['[data-onboarding="topic-suggestion"]'],
  },
  {
    title: "Hit Generate!",
    description:
      "Once you're happy with your prompt, press Generate. We'll write the script, create the animations, record the narration, and produce the final video — all automatically.",
    icon: <Play className="size-4" />,
    selectors: ['[data-onboarding="submit"]'],
  },
];

type TargetBox = {
  top: number;
  left: number;
  width: number;
  height: number;
};

function getTarget(selectors: string[]): { el: HTMLElement; rect: DOMRect } | null {
  for (const selector of selectors) {
    const element = document.querySelector(selector) as HTMLElement | null;
    if (!element) continue;

    const rect = element.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      return { el: element, rect };
    }
  }
  return null;
}

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [targetBox, setTargetBox] = useState<TargetBox | null>(null);
  const [quickStartMode, setQuickStartMode] = useState<"video" | "short">("video");
  const [isVisible, setIsVisible] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const animationFrameRef = useRef<number | null>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentStep = TOUR_STEPS[step];
  const totalSteps = TOUR_STEPS.length;

  // Fade-in on mount
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 50);
    return () => clearTimeout(timer);
  }, []);

  const update = useCallback(() => {
    const result = getTarget(currentStep.selectors);
    if (!result) {
      setTargetBox(null);
      return;
    }

    const { rect } = result;
    const padding = 12;

    setTargetBox({
      left: Math.max(8, rect.left - padding),
      top: Math.max(8, rect.top - padding),
      width: rect.width + padding * 2,
      height: rect.height + padding * 2,
    });
  }, [currentStep.selectors]);

  useEffect(() => {
    const scheduleUpdate = () => {
      if (animationFrameRef.current !== null) return;
      animationFrameRef.current = requestAnimationFrame(() => {
        animationFrameRef.current = null;
        update();
      });
    };

    scheduleUpdate();

    const handleScroll = () => {
      setIsScrolling(true);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = setTimeout(() => {
        setIsScrolling(false);
      }, 120);
      scheduleUpdate();
    };

    const observer = new MutationObserver(scheduleUpdate);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style", "hidden"],
    });

    // ResizeObserver for target element
    const resizeObserver = new ResizeObserver(scheduleUpdate);
    const result = getTarget(currentStep.selectors);
    if (result) {
      resizeObserver.observe(result.el);
    }

    window.addEventListener("resize", scheduleUpdate, { passive: true });
    window.addEventListener("scroll", handleScroll, { passive: true, capture: true });

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      observer.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("scroll", handleScroll, true);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    };
  }, [currentStep.selectors, update]);

  const tooltipRef = useRef<HTMLDivElement>(null);

  const tooltipStyle = useMemo(() => {
    if (!targetBox) {
      return {
        top: "50%",
        left: "50%",
        right: "auto" as const,
        transform: "translate(-50%, -50%)",
      };
    }

    if (typeof window === "undefined") {
      return {
        top: `${targetBox.top}px`,
        left: `${targetBox.left}px`,
        right: "auto" as const,
        transform: "translate(0, 0)",
      };
    }

    const cardWidth = 380;
    const cardHeight = tooltipRef.current?.offsetHeight ?? 260;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const gap = 16;

    let left = targetBox.left;
    let top = targetBox.top + targetBox.height + gap;

    // If tooltip goes below viewport, put it above
    if (top + cardHeight > viewportHeight - 16) {
      top = Math.max(16, targetBox.top - cardHeight - gap);
    }

    // Vertical clamping so it never overflows the viewport
    if (top + cardHeight > viewportHeight - 16) {
      top = viewportHeight - cardHeight - 16;
    }
    if (top < 16) {
      top = 16;
    }

    // Horizontal clamping
    if (left + cardWidth > viewportWidth - 16) {
      left = viewportWidth - cardWidth - 16;
    }
    if (left < 16) {
      left = 16;
    }

    return {
      top: `${top}px`,
      left: `${left}px`,
      right: "auto" as const,
      transform: "translate(0, 0)",
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetBox, step]);

  const handleNext = () => setStep((prev) => Math.min(totalSteps - 1, prev + 1));
  const handleBack = () => setStep((prev) => Math.max(0, prev - 1));
  const handleFinish = () => onComplete(null, null);
  const handleSkip = () => onComplete(null, null);

  const handleQuickStart = () => {
    const quickStartPrompt =
      quickStartMode === "video"
        ? "Generate a video explaining the Pythagorean theorem with a clean geometric proof"
        : "Generate a short vertical video explaining photosynthesis in 30 seconds";
    onComplete(quickStartPrompt, quickStartMode);
  };

  const quickStartPromptPreview =
    quickStartMode === "video"
      ? "Generate a video explaining the Pythagorean theorem with a clean geometric proof"
      : "Generate a short vertical video explaining photosynthesis in 30 seconds";

  return (
    <div
      className={`fixed inset-0 z-[120] transition-opacity duration-500 ${isVisible ? "opacity-100" : "opacity-0"}`}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[3px]" />

      {/* Spotlight cutout */}
      {targetBox && (
        <div
          className="absolute rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]"
          style={{
            top: targetBox.top,
            left: targetBox.left,
            width: targetBox.width,
            height: targetBox.height,
            transition: isScrolling ? "none" : "all 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          {/* Animated ring */}
          <div className="absolute -inset-[3px] animate-pulse rounded-[14px] border-2 border-white/30" />
          <div className="absolute -inset-[1px] rounded-[13px] border border-white/10" />
        </div>
      )}

      {/* Tooltip card */}
      <div
        ref={tooltipRef}
        className="absolute max-h-[calc(100vh-32px)] w-[min(380px,calc(100vw-32px))] overflow-y-auto rounded-2xl border border-white/10 bg-zinc-900/95 text-white shadow-2xl backdrop-blur-xl"
        style={{
          ...tooltipStyle,
          transition: isScrolling ? "none" : "all 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      >
        {/* Top accent bar */}
        <div className="h-1 w-full bg-gradient-to-r from-blue-500 via-violet-500 to-purple-500" />

        <div className="p-5">
          {/* Header row */}
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-widest text-white/60">
              {currentStep.icon}
              Step {step + 1} of {totalSteps}
            </div>
            <button
              onClick={handleSkip}
              className="rounded-md px-2 py-1 text-xs text-white/40 transition-colors hover:bg-white/10 hover:text-white/70"
            >
              Skip tour
            </button>
          </div>

          {/* Content */}
          <h2 className="text-lg font-semibold leading-snug tracking-tight">
            {currentStep.title}
          </h2>
          <p className="mt-2.5 text-[13px] leading-relaxed text-white/60">
            {currentStep.description}
          </p>

          {/* Quick Start panel on last step */}
          {step === totalSteps - 1 && (
            <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="mb-3 flex items-center gap-2">
                <Zap className="size-3.5 text-amber-400" />
                <span className="text-xs font-semibold uppercase tracking-wider text-white/70">
                  Quick start
                </span>
              </div>
              <p className="mb-3 text-xs leading-relaxed text-white/50">
                Don't want to type? Choose a format below and we'll auto-fill a
                beginner-friendly prompt and start generating immediately.
              </p>

              <div className="mb-3 inline-flex rounded-lg bg-white/10 p-0.5">
                <button
                  onClick={() => setQuickStartMode("video")}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                    quickStartMode === "video"
                      ? "bg-white text-zinc-900 shadow-sm"
                      : "text-white/50 hover:text-white/80"
                  }`}
                >
                  <MonitorPlay className="size-3" />
                  Video
                </button>
                <button
                  onClick={() => setQuickStartMode("short")}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
                    quickStartMode === "short"
                      ? "bg-white text-zinc-900 shadow-sm"
                      : "text-white/50 hover:text-white/80"
                  }`}
                >
                  <Smartphone className="size-3" />
                  Short
                </button>
              </div>

              <div className="rounded-lg bg-black/30 px-3 py-2.5">
                <p className="text-[11px] font-medium uppercase tracking-wider text-white/30">
                  Prompt preview
                </p>
                <p className="mt-1 text-xs leading-relaxed text-white/70">
                  {quickStartPromptPreview}
                </p>
              </div>
            </div>
          )}

          {/* Footer: progress dots + nav */}
          <div className="mt-5 flex items-center justify-between">
            {/* Progress dots */}
            <div className="flex gap-1.5">
              {TOUR_STEPS.map((_, index) => (
                <div
                  key={index}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    index === step
                      ? "w-6 bg-white"
                      : index < step
                        ? "w-2 bg-white/40"
                        : "w-2 bg-white/15"
                  }`}
                />
              ))}
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-2">
              {step > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleBack}
                  className="h-8 rounded-lg px-2 text-white/50 hover:bg-white/10 hover:text-white"
                >
                  <ChevronLeft className="size-4" />
                </Button>
              )}

              {step < totalSteps - 1 ? (
                <Button
                  size="sm"
                  onClick={handleNext}
                  className="h-8 rounded-lg bg-white px-4 text-zinc-900 hover:bg-white/90"
                >
                  Next
                  <ChevronRight className="ml-0.5 size-3.5" />
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={handleQuickStart}
                    className="h-8 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 text-amber-300 hover:bg-amber-500/20 hover:text-amber-200"
                  >
                    <Zap className="mr-1 size-3" />
                    Quick start
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleFinish}
                    className="h-8 rounded-lg bg-white px-4 text-zinc-900 hover:bg-white/90"
                  >
                    Got it
                    <ChevronRight className="ml-0.5 size-3.5" />
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}

export default Onboarding;
