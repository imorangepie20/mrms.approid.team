import { describe, expect, it } from "vitest";

import { filterRankingCandidates } from "./filters";

describe("recommendation filters", () => {
  it("removes inactive, unplayable, rejected, and duplicate candidates", () => {
    const result = filterRankingCandidates([
      { id: "keep", isActive: true, isPlayable: true },
      { id: "keep", isActive: true, isPlayable: true },
      { id: "inactive", isActive: false, isPlayable: true },
      { id: "blocked", isActive: true, isPlayable: true },
      { id: "unplayable", isActive: true, isPlayable: false },
    ], new Set(["blocked"]));

    expect(result.map((candidate) => candidate.id)).toEqual(["keep"]);
  });
});
