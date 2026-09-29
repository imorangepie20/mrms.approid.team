import { describe, expect, it } from "vitest";

import { evaluateShadowRanking } from "./candidates";

describe("shadow ranking evaluation", () => {
  it("compares top K without changing either ranking", () => {
    const baseline = [
      { artist: "A", id: "a" },
      { artist: "A", id: "a2" },
      { artist: "B", id: "b" },
    ];
    const hybrid = [
      { artist: "A", audioAvailable: true, baseRank: 1, fallbackUsed: false, id: "a", moodAvailable: true, rhythmAvailable: true, selectedRank: 1 },
      { artist: "B", audioAvailable: false, baseRank: 3, fallbackUsed: true, id: "b", moodAvailable: false, rhythmAvailable: false, selectedRank: 2 },
      { artist: "A", audioAvailable: true, baseRank: 2, fallbackUsed: false, id: "a2", moodAvailable: true, rhythmAvailable: true, selectedRank: 3 },
    ];

    expect(evaluateShadowRanking(baseline, hybrid, 2)).toEqual({
      audioCoverageRatio: 2 / 3,
      candidateCount: 3,
      fallbackUsed: true,
      hybridTrackIds: ["a", "b"],
      meanAbsoluteRankDisplacement: 2 / 3,
      moodCoverageRatio: 2 / 3,
      overlapAtK: 0.5,
      rhythmCoverageRatio: 2 / 3,
      sameArtistRatio: 0,
      selectorChangedCount: 1,
    });
    expect(baseline.map((candidate) => candidate.id)).toEqual(["a", "a2", "b"]);
  });
});
