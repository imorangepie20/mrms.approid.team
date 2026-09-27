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
    expect(resolveVisualizerMaxBarHeight(800)).toBe(304);
    expect(resolveVisualizerMaxBarHeight(1200)).toBe(390);
  });

  it("preserves height variation instead of saturating loud bands", () => {
    const spectrum = Float32Array.from(
      { length: 128 },
      (_, index) => 230 - index * 1.25,
    );

    const levels = createVisualizerBarLevels(spectrum);
    const distinctHeights = new Set(Array.from(levels, (level) => level.toFixed(3)));

    expect(distinctHeights.size).toBeGreaterThan(12);
    expect(levels.filter((level) => level >= 0.87)).toHaveLength(0);
  });

  it("mirrors logarithmic bands with bass in the center and treble at the edges", () => {
    const low = new Float32Array(128);
    const high = new Float32Array(128);
    low[2] = 220;
    high[96] = 120;

    const lowLevels = createVisualizerBarLevels(low);
    const highLevels = createVisualizerBarLevels(high);
    const lowPeak = lowLevels.indexOf(Math.max(...lowLevels));
    const highPeak = highLevels.indexOf(Math.max(...highLevels));

    expect(lowPeak).toBeGreaterThanOrEqual(18);
    expect(lowPeak).toBeLessThanOrEqual(29);
    expect(highPeak < 8 || highPeak > 39).toBe(true);
    expect(highLevels[highPeak]).toBeGreaterThan(0);
    for (let index = 0; index < lowLevels.length / 2; index += 1) {
      expect(lowLevels[index]).toBeCloseTo(lowLevels[lowLevels.length - 1 - index], 6);
      expect(highLevels[index]).toBeCloseTo(highLevels[highLevels.length - 1 - index], 6);
    }
  });
});
