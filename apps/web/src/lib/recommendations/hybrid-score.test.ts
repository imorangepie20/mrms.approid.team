import { describe, expect, it } from "vitest";

import { calculateHybridScore } from "./hybrid-score";

describe("hybrid-v0 score", () => {
  it("uses all documented components when audio coverage exists", () => {
    const result = calculateHybridScore({
      audio: 1,
      candidateBpm: 120,
      candidatePredictions: { happy: 0.8, non_happy: 0.2 },
      catalog: 1,
      editorial: 1,
      freshness: 1,
      profileBpm: 120,
      profilePredictions: { happy: 0.8, non_happy: 0.2 },
      text: 1,
    });

    expect(result.baseScore).toBe(1);
    expect(result.components).toMatchObject({
      audio: 1,
      catalog: 1,
      freshness: 1,
      hybridSimilarity: 1,
      mood: 1,
      rhythm: 1,
      text: 1,
    });
    expect(result.fallbackUsed).toBe(false);
  });

  it("renormalizes similarity to text without inventing unavailable audio values", () => {
    const result = calculateHybridScore({
      audio: null,
      candidateBpm: null,
      candidatePredictions: null,
      catalog: 1,
      editorial: 0,
      freshness: 0.5,
      profileBpm: null,
      profilePredictions: null,
      text: 0.8,
    });

    expect(result.components.audio).toBeNull();
    expect(result.components.mood).toBeNull();
    expect(result.components.rhythm).toBeNull();
    expect(result.components.hybridSimilarity).toBe(0.8);
    expect(result.baseScore).toBe(0.72);
    expect(result.fallbackUsed).toBe(true);
    expect(result.reasonCodes).toContain("audio_unavailable_text_fallback");
  });

  it("computes bounded mood and relative BPM similarity", () => {
    const result = calculateHybridScore({
      audio: 0.5,
      candidateBpm: 90,
      candidatePredictions: { happy: 0.2, non_happy: 0.8 },
      catalog: 0.5,
      editorial: 0.5,
      freshness: 0.5,
      profileBpm: 120,
      profilePredictions: { happy: 0.8, non_happy: 0.2 },
      text: 0.5,
    });

    expect(result.components.mood).toBeCloseTo(0.4, 6);
    expect(result.components.rhythm).toBeCloseTo(0.75, 6);
    expect(result.baseScore).toBeGreaterThanOrEqual(0);
    expect(result.baseScore).toBeLessThanOrEqual(1);
  });
});
