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
  useRef,
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
const TOOLTIP_MARGIN = 12;

export function OnboardingTour({ steps, onClose }: OnboardingTourProps) {
  const [index, setIndex] = useState(0);

  const activeStep = steps[index];
  const [rect, setRect] = useState<SpotlightRect | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [tooltipSize, setTooltipSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
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

    // If the element is outside the viewport, scroll it into view (mobile-friendly)
    if (typeof window !== "undefined") {
      const margin = 12;
      const bottom = bounds.top + bounds.height;
      const needsScroll =
        bounds.top < margin || bottom > window.innerHeight - margin;
      if (needsScroll) {
        try {
          element.scrollIntoView({
            behavior: "smooth",
            block: "center",
            inline: "nearest",
          });
        } catch {
          element.scrollIntoView();
        }
      }
    }

    let nextViewport = viewport;
    if (typeof window !== "undefined") {
      nextViewport = {
        width: window.innerWidth,
        height: window.innerHeight,
      };
      setViewport((prev) =>
        prev.width === nextViewport.width && prev.height === nextViewport.height
          ? prev
          : nextViewport
      );
    }

    const basePadding =
      activeStep.spotlightPadding ?? SPOTLIGHT_DEFAULT_PADDING;
    const paddingScale = nextViewport.width < 640 ? 0.6 : 1;
    const padding = Math.max(8, Math.round(basePadding * paddingScale));

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
      // Re-measure tooltip after layout changes
      const el = tooltipRef.current;
      if (el) {
        const r = el.getBoundingClientRect();
        setTooltipSize({ width: r.width, height: r.height });
      }
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

    const raf = requestAnimationFrame(() => {
      updateRect();
      const el = tooltipRef.current;
      if (el) {
        const r = el.getBoundingClientRect();
        setTooltipSize({ width: r.width, height: r.height });
      }
    });

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

    const isMobile = viewport.width > 0 ? viewport.width < 640 : false;
    const preferredPlacement = activeStep.placement ?? "bottom";
    const placement = isMobile ? "bottom" : preferredPlacement;

    const style: CSSProperties = {};
    const margin = TOOLTIP_MARGIN;
    const vw = viewport.width || 0;
    const vh = viewport.height || 0;
    const maxWidth =
      vw > 0 ? Math.max(240, Math.min(384, vw - margin * 2)) : 384;

    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const clamp = (n: number, min: number, max: number) =>
      Math.min(Math.max(n, min), max);

    const th = tooltipSize?.height ?? 0;
    const tw = tooltipSize?.width ?? 0;

    switch (placement) {
      case "top": {
        let top = rect.top - TOOLTIP_OFFSET;
        if (vh && th) {
          // Account for translateY(-100%) transform
          top = clamp(top, margin + th, vh - margin);
        }
        style.top = top;
        const left = centerX;
        style.left = vw
          ? clamp(
              left,
              margin + (tw ? tw / 2 : maxWidth / 2),
              vw - margin - (tw ? tw / 2 : maxWidth / 2)
            )
          : left;
        break;
      }
      case "left": {
        style.left = rect.left - TOOLTIP_OFFSET;
        let top = centerY;
        if (vh && th) {
          // Account for translateY(-50%)
          top = clamp(top, margin + th / 2, vh - margin - th / 2);
        } else {
          top = vh ? clamp(top, margin, vh - margin) : top;
        }
        style.top = top;
        break;
      }
      case "right": {
        style.left = rect.left + rect.width + TOOLTIP_OFFSET;
        let top = centerY;
        if (vh && th) {
          top = clamp(top, margin + th / 2, vh - margin - th / 2);
        } else {
          top = vh ? clamp(top, margin, vh - margin) : top;
        }
        style.top = top;
        break;
      }
      case "bottom":
      default: {
        let top = rect.top + rect.height + TOOLTIP_OFFSET;
        if (vh && th) {
          top = Math.min(top, vh - margin - th); // Keep fully visible at bottom
        }
        style.top = top;
        const left = centerX;
        style.left = vw
          ? clamp(
              left,
              margin + (tw ? tw / 2 : maxWidth / 2),
              vw - margin - (tw ? tw / 2 : maxWidth / 2)
            )
          : left;
        break;
      }
    }

    style.maxWidth = maxWidth;

    return style;
  }, [rect, activeStep, viewport, tooltipSize]);

  const tooltipTransformClass = useMemo(() => {
    const isMobile = viewport.width < 640;
    const placement = isMobile ? "bottom" : activeStep?.placement ?? "bottom";

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
  }, [activeStep?.placement, viewport]);

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

      {rect && maskedRect ? (
        <div
          className="pointer-events-none absolute border border-primary/60 bg-transparent shadow-[0_12px_40px_-12px_rgba(59,130,246,0.45)] ring-4 ring-primary/20 transition-all duration-200"
          style={{
            top: maskedRect.y,
            left: maskedRect.x,
            width: maskedRect.width,
            height: maskedRect.height,
            borderRadius: SPOTLIGHT_RADIUS,
          }}
        />
      ) : null}

      {tooltipStyle ? (
        <div
          ref={tooltipRef}
          className={cn(
            "pointer-events-auto absolute w-auto max-w-full rounded-2xl border border-zinc-200/70 bg-background/95 p-5 shadow-xl backdrop-blur",
            tooltipTransformClass
          )}
          style={{
            ...tooltipStyle,
            paddingBottom: "max(env(safe-area-inset-bottom), 0px)",
          }}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs font-mono uppercase tracking-wide text-zinc-400">
              Step {index + 1} of {steps.length}
            </span>
            <Button variant="ghost" size="sm" onClick={() => onClose()}>
              Skip
            </Button>
          </div>

          <h2 className="mt-3 font-semibold text-lg text-foreground">
            {activeStep.title}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {activeStep.description}
          </p>

          <div className="mt-4 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2">
            <Button
              className="w-full sm:w-auto"
              variant="ghost"
              size="sm"
              onClick={() => setIndex((value) => Math.max(0, value - 1))}
              disabled={index === 0}
            >
              Back
            </Button>
            <Button
              className="w-full sm:w-auto"
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
