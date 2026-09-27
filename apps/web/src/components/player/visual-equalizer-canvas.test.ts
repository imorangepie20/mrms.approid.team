import { describe, expect, it } from "vitest";

import {
  createVisualizerBarLevels,
  resolveVisualizerBarLayout,
  resolveVisualizerMaxBarHeight,
} from "./visual-equalizer-canvas";

describe("visual equalizer bar distribution", () => {
  it("places the full bar group slightly right of center", () => {
    const width = 1000;
    const layout = resolveVisualizerBarLayout(width);
    expect(layout.startX + layout.totalWidth / 2).toBeCloseTo(width * 0.525, 5);
    expect(layout.startX).toBeGreaterThan(0);
  });

  it("keeps bar height below half of the stage", () => {
    expect(resolveVisualizerMaxBarHeight(800)).toBe(368);
    expect(resolveVisualizerMaxBarHeight(1200)).toBe(390);
  });

  it("spreads low and high frequency energy across logarithmic bands", () => {
    const low = new Float32Array(128);
    const high = new Float32Array(128);
    low[2] = 220;
    high[96] = 120;

    const lowLevels = createVisualizerBarLevels(low);
    const highLevels = createVisualizerBarLevels(high);
    const lowPeak = lowLevels.indexOf(Math.max(...lowLevels));
    const highPeak = highLevels.indexOf(Math.max(...highLevels));

    expect(lowPeak).toBeLessThan(20);
    expect(highPeak).toBeGreaterThan(36);
    expect(highLevels[highPeak]).toBeGreaterThan(0);
  });
});
