"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

type TrackRailProps = {
  ariaLabel: string;
  children: ReactNode;
  className?: string;
};

const SCROLL_RATIO = 0.82;
const MIN_SCROLL_DISTANCE = 240;

function getScrollDistance(viewport: HTMLDivElement) {
  return Math.max(Math.round(viewport.clientWidth * SCROLL_RATIO), MIN_SCROLL_DISTANCE);
}

export function TrackRail({ ariaLabel, children, className = "" }: TrackRailProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  const updateScrollControls = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    setCanScrollLeft(viewport.scrollLeft > 2);
    setCanScrollRight(viewport.scrollLeft + viewport.clientWidth < viewport.scrollWidth - 2);
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    updateScrollControls();
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(updateScrollControls);
    resizeObserver?.observe(viewport);
    viewport.addEventListener("scroll", updateScrollControls, { passive: true });

    const mediaQuery = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const updateMotionPreference = () => setPrefersReducedMotion(Boolean(mediaQuery?.matches));
    updateMotionPreference();
    mediaQuery?.addEventListener?.("change", updateMotionPreference);

    return () => {
      resizeObserver?.disconnect();
      viewport.removeEventListener("scroll", updateScrollControls);
      mediaQuery?.removeEventListener?.("change", updateMotionPreference);
    };
  }, [updateScrollControls]);

  const move = (direction: -1 | 1) => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    viewport.scrollBy({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      left: direction * getScrollDistance(viewport),
    });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      move(event.key === "ArrowLeft" ? -1 : 1);
      return;
    }

    const viewport = viewportRef.current;
    if (!viewport || (event.key !== "Home" && event.key !== "End")) return;

    event.preventDefault();
    viewport.scrollTo({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      left: event.key === "Home" ? 0 : viewport.scrollWidth,
    });
  };

  return (
    <div className={`track-rail-shell ${className}`}>
      <button
        aria-label={`${ariaLabel} 이전`}
        className="track-rail-control track-rail-control-prev"
        disabled={!canScrollLeft}
        type="button"
        onClick={() => move(-1)}
      >
        <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
          <path d="m14.5 5-7 7 7 7" />
        </svg>
      </button>
      <div
        ref={viewportRef}
        aria-label={ariaLabel}
        className="track-rail-viewport"
        role="region"
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        <div className="track-rail-track">{children}</div>
      </div>
      <button
        aria-label={`${ariaLabel} 다음`}
        className="track-rail-control track-rail-control-next"
        disabled={!canScrollRight}
        type="button"
        onClick={() => move(1)}
      >
        <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
          <path d="m9.5 5 7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}
