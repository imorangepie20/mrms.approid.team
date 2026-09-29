import { describe, expect, it } from "vitest";

import { rankHybridCandidates } from "./selector";

describe("hybrid-v0 selector", () => {
  it("applies artist diversity after independent scoring with stable ranks", () => {
    const ranked = rankHybridCandidates([
      { artist: "Artist A", baseScore: 0.9, id: "a" },
      { artist: "Artist A", baseScore: 0.89, id: "a2" },
      { artist: "Artist B", baseScore: 0.84, id: "b" },
    ]);

    expect(ranked.map((candidate) => candidate.id)).toEqual(["a", "b", "a2"]);
    expect(ranked.map((candidate) => candidate.baseRank)).toEqual([1, 3, 2]);
    expect(ranked[1]).toMatchObject({ repeatedArtist: false, selectedRank: 2, selectorScore: 0.84 });
    expect(ranked[2]).toMatchObject({ repeatedArtist: true, selectedRank: 3, selectorScore: 0.815 });
  });

  it("uses track ID as a deterministic tie breaker", () => {
    const ranked = rankHybridCandidates([
      { artist: "B", baseScore: 0.5, id: "b" },
      { artist: "A", baseScore: 0.5, id: "a" },
    ]);

    expect(ranked.map((candidate) => candidate.id)).toEqual(["a", "b"]);
  });
});
