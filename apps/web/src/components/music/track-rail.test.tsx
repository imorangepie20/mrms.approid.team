import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { TrackRail } from "./track-rail";

describe("TrackRail", () => {
  it("moves the rail with an animated button instead of exposing a scrollbar", () => {
    render(
      <TrackRail ariaLabel="추천 트랙">
        <div>첫 번째 트랙</div>
        <div>두 번째 트랙</div>
      </TrackRail>,
    );

    const viewport = screen.getByRole("region", { name: "추천 트랙" });
    const scrollBy = vi.fn();
    Object.defineProperty(viewport, "scrollWidth", { configurable: true, value: 900 });
    Object.defineProperty(viewport, "clientWidth", { configurable: true, value: 360 });
    Object.defineProperty(viewport, "scrollLeft", { configurable: true, value: 0, writable: true });
    Object.defineProperty(viewport, "scrollBy", { configurable: true, value: scrollBy });
    fireEvent.scroll(viewport);

    const next = screen.getByRole("button", { name: "추천 트랙 다음" });
    expect(next).not.toBeDisabled();

    fireEvent.click(next);

    expect(scrollBy).toHaveBeenCalledWith({
      behavior: "smooth",
      left: 295,
    });
    expect(viewport).toHaveClass("track-rail-viewport");
  });

  it("moves with arrow keys and keeps the viewport keyboard reachable", () => {
    render(
      <TrackRail ariaLabel="신곡">
        <div>트랙</div>
      </TrackRail>,
    );
    const viewport = screen.getByRole("region", { name: "신곡" });
    const scrollBy = vi.fn();
    Object.defineProperty(viewport, "scrollWidth", { configurable: true, value: 900 });
    Object.defineProperty(viewport, "clientWidth", { configurable: true, value: 360 });
    Object.defineProperty(viewport, "scrollLeft", { configurable: true, value: 0, writable: true });
    Object.defineProperty(viewport, "scrollBy", { configurable: true, value: scrollBy });
    fireEvent.scroll(viewport);
    fireEvent.keyDown(viewport, { key: "ArrowRight" });

    expect(viewport).toHaveAttribute("tabindex", "0");
    expect(scrollBy).toHaveBeenCalledWith({ behavior: "smooth", left: 295 });
  });
});
