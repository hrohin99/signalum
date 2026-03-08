import { useState, useEffect, useCallback, useRef } from "react";
import type { TourStep } from "@/lib/tourConfig";

interface CoachMarksProps {
  steps: TourStep[];
  storageKey: string;
  onComplete?: () => void;
}

function isModalOpen(): boolean {
  return document.querySelectorAll('[role="dialog"]').length > 0;
}

export function CoachMarks({ steps, storageKey, onComplete }: CoachMarksProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [position, setPosition] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [visible, setVisible] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [tooltipPlacement, setTooltipPlacement] = useState<"bottom" | "top">("bottom");
  const observerRef = useRef<MutationObserver | null>(null);

  const seen = localStorage.getItem(storageKey) === "true";

  const findNextValidStep = useCallback((startIndex: number): number => {
    for (let i = startIndex; i < steps.length; i++) {
      const el = document.querySelector(`[data-tour="${steps[i].target}"]`);
      if (el) return i;
    }
    return -1;
  }, [steps]);

  const updatePosition = useCallback((index: number) => {
    if (index < 0 || index >= steps.length) return;
    const el = document.querySelector(`[data-tour="${steps[index].target}"]`);
    if (!el) {
      const nextValid = findNextValidStep(index + 1);
      if (nextValid === -1) {
        finish();
      } else {
        setCurrentIndex(nextValid);
      }
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => {
      const rect = el.getBoundingClientRect();
      setPosition({
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      });
      const spaceBelow = window.innerHeight - rect.bottom;
      setTooltipPlacement(spaceBelow > 200 ? "bottom" : "top");
    }, 350);
  }, [steps, findNextValidStep]);

  useEffect(() => {
    if (seen) return;

    const tryStart = () => {
      const firstValid = findNextValidStep(0);
      if (firstValid === -1) return;
      setCurrentIndex(firstValid);
      setVisible(true);
    };

    const timer = setTimeout(() => {
      if (!isModalOpen()) {
        tryStart();
        return;
      }

      if (observerRef.current) {
        observerRef.current.disconnect();
      }

      const observer = new MutationObserver(() => {
        if (!isModalOpen()) {
          observer.disconnect();
          observerRef.current = null;
          setTimeout(tryStart, 500);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["role", "style", "class", "hidden", "open"] });
      observerRef.current = observer;
    }, 800);

    return () => {
      clearTimeout(timer);
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
    };
  }, [seen, findNextValidStep]);

  useEffect(() => {
    if (!visible) return;
    updatePosition(currentIndex);
  }, [currentIndex, visible, updatePosition]);

  useEffect(() => {
    if (!visible) return;
    const handleResize = () => updatePosition(currentIndex);
    window.addEventListener("resize", handleResize);
    window.addEventListener("scroll", handleResize, true);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("scroll", handleResize, true);
    };
  }, [visible, currentIndex, updatePosition]);

  const finish = useCallback(() => {
    localStorage.setItem(storageKey, "true");
    setVisible(false);
    onComplete?.();
  }, [storageKey, onComplete]);

  const handleNext = () => {
    const nextValid = findNextValidStep(currentIndex + 1);
    if (nextValid === -1) {
      finish();
    } else {
      setCurrentIndex(nextValid);
    }
  };

  if (seen || !visible || !position) return null;

  const step = steps[currentIndex];
  const validStepCount = steps.filter(s => document.querySelector(`[data-tour="${s.target}"]`)).length;
  const currentVisualIndex = steps.slice(0, currentIndex + 1).filter(s => document.querySelector(`[data-tour="${s.target}"]`)).length;

  const tooltipStyle: React.CSSProperties = tooltipPlacement === "bottom"
    ? { top: position.top + position.height + 12, left: position.left + position.width / 2 }
    : { top: position.top - 12, left: position.left + position.width / 2 };

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none" data-testid="coach-marks-overlay">
      <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: "auto" }}>
        <defs>
          <mask id="coach-mask">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            <rect
              x={position.left - 4}
              y={position.top - 4}
              width={position.width + 8}
              height={position.height + 8}
              rx="8"
              fill="black"
            />
          </mask>
        </defs>
        <rect
          x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.4)"
          mask="url(#coach-mask)"
        />
      </svg>

      <div
        className="absolute rounded-lg border-2 border-[#1e3a5f]/40"
        style={{
          top: position.top - 4,
          left: position.left - 4,
          width: position.width + 8,
          height: position.height + 8,
          pointerEvents: "none",
        }}
      />

      <div
        ref={tooltipRef}
        className="absolute pointer-events-auto bg-[#1e3a5f] text-white rounded-xl shadow-xl p-4 w-[300px]"
        style={{
          ...tooltipStyle,
          transform: tooltipPlacement === "bottom"
            ? "translateX(-50%)"
            : "translateX(-50%) translateY(-100%)",
        }}
        data-testid={`coach-mark-step-${step.target}`}
      >
        <p className="text-sm font-semibold mb-1">{step.title}</p>
        <p className="text-xs text-white/80 leading-relaxed mb-3">{step.body}</p>
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-white/50">{currentVisualIndex} of {validStepCount}</span>
          <div className="flex gap-2">
            <button
              className="text-xs text-white/60 hover:text-white/90 transition-colors"
              onClick={finish}
              data-testid="button-coach-skip"
            >
              Skip
            </button>
            <button
              className="text-xs bg-white text-[#1e3a5f] font-medium px-3 py-1 rounded-md hover:bg-white/90 transition-colors"
              onClick={handleNext}
              data-testid="button-coach-next"
            >
              {findNextValidStep(currentIndex + 1) === -1 ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
