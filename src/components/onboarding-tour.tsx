"use client";

import {
  type CSSProperties,
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SpotlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export type OnboardingStep = {
  id: string;
  title: string;
  description: string;
  target: RefObject<HTMLElement | null>;
  placement?: "top" | "bottom" | "left" | "right";
  spotlightPadding?: number;
};

type OnboardingTourProps = {
  steps: OnboardingStep[];
  onClose: () => void;
};

const SPOTLIGHT_DEFAULT_PADDING = 18;
const TOOLTIP_OFFSET = 28;
const SPOTLIGHT_RADIUS = 28;

export function OnboardingTour({ steps, onClose }: OnboardingTourProps) {
  const [index, setIndex] = useState(0);

  const activeStep = steps[index];
  const [rect, setRect] = useState<SpotlightRect | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const generatedId = useId();
  const maskId = `onboarding-mask-${generatedId.replace(/:/g, "")}`;

  const updateRect = useCallback(() => {
    if (!activeStep) {
      setRect(null);
      return;
    }

    const element = activeStep.target.current;

    if (!element) {
      setRect(null);
      return;
    }

    const bounds = element.getBoundingClientRect();
    const padding = activeStep.spotlightPadding ?? SPOTLIGHT_DEFAULT_PADDING;

    if (typeof window !== "undefined") {
      const nextViewport = {
        width: window.innerWidth,
        height: window.innerHeight,
      };
      setViewport((prev) =>
        prev.width === nextViewport.width && prev.height === nextViewport.height
          ? prev
          : nextViewport
      );
    }

    setRect({
      top: bounds.top - padding,
      left: bounds.left - padding,
      width: bounds.width + padding * 2,
      height: bounds.height + padding * 2,
    });
  }, [activeStep]);

  useLayoutEffect(() => {
    updateRect();
  }, [updateRect]);

  useEffect(() => {
    if (!activeStep) {
      return;
    }

    if (typeof window !== "undefined") {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    }

    const handleRelayout = () => {
      updateRect();
    };

    const element = activeStep.target.current;
    const observer = element
      ? new ResizeObserver(() => {
          updateRect();
        })
      : null;

    if (observer && element) {
      observer.observe(element);
    }

    window.addEventListener("resize", handleRelayout);
    window.addEventListener("scroll", handleRelayout, true);

    const raf = requestAnimationFrame(updateRect);

    return () => {
      if (observer && element) {
        observer.unobserve(element);
        observer.disconnect();
      }

      window.removeEventListener("resize", handleRelayout);
      window.removeEventListener("scroll", handleRelayout, true);
      cancelAnimationFrame(raf);
    };
  }, [activeStep, updateRect]);

  const tooltipStyle = useMemo(() => {
    if (!rect || !activeStep) {
      return null;
    }

    const placement = activeStep.placement ?? "bottom";

    const style: CSSProperties = {};

    switch (placement) {
      case "top":
        style.top = rect.top - TOOLTIP_OFFSET;
        style.left = rect.left + rect.width / 2;
        break;
      case "left":
        style.top = rect.top + rect.height / 2;
        style.left = rect.left - TOOLTIP_OFFSET;
        break;
      case "right":
        style.top = rect.top + rect.height / 2;
        style.left = rect.left + rect.width + TOOLTIP_OFFSET;
        break;
      case "bottom":
      default:
        style.top = rect.top + rect.height + TOOLTIP_OFFSET;
        style.left = rect.left + rect.width / 2;
        break;
    }

    return style;
  }, [rect, activeStep]);

  const tooltipTransformClass = useMemo(() => {
    const placement = activeStep?.placement ?? "bottom";

    switch (placement) {
      case "top":
        return "-translate-x-1/2 -translate-y-full";
      case "left":
        return "-translate-y-1/2 -translate-x-full";
      case "right":
        return "-translate-y-1/2";
      case "bottom":
      default:
        return "-translate-x-1/2";
    }
  }, [activeStep?.placement]);

  const maskedRect = useMemo(() => {
    if (!rect) {
      return null;
    }

    const x = Math.max(rect.left, 0);
    const y = Math.max(rect.top, 0);

    if (viewport.width === 0 || viewport.height === 0) {
      return {
        x,
        y,
        width: rect.width,
        height: rect.height,
      };
    }

    const clampedRight = Math.min(rect.left + rect.width, viewport.width);
    const clampedBottom = Math.min(rect.top + rect.height, viewport.height);

    return {
      x,
      y,
      width: Math.max(clampedRight - x, 0),
      height: Math.max(clampedBottom - y, 0),
    };
  }, [rect, viewport]);

  if (!activeStep || typeof window === "undefined") {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-50">
      {rect && maskedRect && viewport.width > 0 && viewport.height > 0 ? (
        <svg
          className="absolute inset-0 h-full w-full pointer-events-auto"
          viewBox={`0 0 ${viewport.width} ${viewport.height}`}
          preserveAspectRatio="none"
        >
          <defs>
            <mask id={maskId} maskUnits="userSpaceOnUse">
              <rect width="100%" height="100%" fill="white" />
              <rect
                x={maskedRect.x}
                y={maskedRect.y}
                width={maskedRect.width}
                height={maskedRect.height}
                rx={SPOTLIGHT_RADIUS}
                ry={SPOTLIGHT_RADIUS}
                fill="black"
              />
            </mask>
          </defs>
          <rect
            width="100%"
            height="100%"
            fill="rgba(9, 9, 11, 0.65)"
            mask={`url(#${maskId})`}
          />
        </svg>
      ) : (
        <div className="absolute inset-0 bg-black/60" />
      )}

      {rect ? (
        <div
          className="pointer-events-none absolute border border-primary/60 bg-transparent shadow-[0_12px_40px_-12px_rgba(59,130,246,0.45)] ring-4 ring-primary/20 transition-all duration-200"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            borderRadius: SPOTLIGHT_RADIUS,
          }}
        />
      ) : null}

      {tooltipStyle ? (
        <div
          className={cn(
            "pointer-events-auto absolute max-w-sm rounded-2xl border border-zinc-200/70 bg-background/95 p-5 shadow-xl backdrop-blur",
            tooltipTransformClass
          )}
          style={tooltipStyle}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-mono uppercase tracking-wide text-zinc-400">
              Step {index + 1} of {steps.length}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onClose()}
            >
              Skip
            </Button>
          </div>

          <h2 className="mt-3 font-semibold text-lg text-foreground">
            {activeStep.title}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {activeStep.description}
          </p>

          <div className="mt-4 flex items-center justify-between gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIndex((value) => Math.max(0, value - 1))}
              disabled={index === 0}
            >
              Back
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (index === steps.length - 1) {
                  onClose();
                } else {
                  setIndex((value) => Math.min(steps.length - 1, value + 1));
                }
              }}
            >
              {index === steps.length - 1 ? "Got it" : "Next"}
            </Button>
          </div>
        </div>
      ) : null}
    </div>,
    document.body
  );
}
