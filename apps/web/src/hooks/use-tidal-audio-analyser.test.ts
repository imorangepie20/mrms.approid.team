import { describe, expect, it } from "vitest";

import { resolveVisualizerReadTime } from "./use-tidal-audio-analyser";

describe("visualizer playback alignment", () => {
  it("reads PCM 1.8 seconds ahead to compensate for observed visual lag", () => {
    expect(resolveVisualizerReadTime(4)).toBeCloseTo(5.8, 5);
  });

  it("preserves unavailable playback time", () => {
    expect(resolveVisualizerReadTime(Number.NaN)).toBeNaN();
  });
});
