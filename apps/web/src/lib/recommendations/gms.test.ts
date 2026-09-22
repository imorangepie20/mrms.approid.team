import { describe, expect, it, vi } from "vitest";

import { calculateEmsScore, filterPermanentlyRejected, recordRecommendationDecision } from "./gms";

describe("EMS GMS scoring", () => {
  it("uses the approved weighted score components", () => {
    expect(calculateEmsScore({ similarity: 1, matchConfidence: 1, catalogPriority: 1, freshness: 1, diversity: 1 })).toBe(1);
    expect(calculateEmsScore({ similarity: 0, matchConfidence: 0, catalogPriority: 0, freshness: 0, diversity: 0 })).toBe(0);
  });

  it("filters permanent rejection per user without mutating the source catalog", () => {
    const source = [{ id: "a" }, { id: "b" }];
    const visible = filterPermanentlyRejected(source, new Set(["b"]));
    expect(visible).toEqual([{ id: "a" }]);
    expect(source).toHaveLength(2);
  });

  it("stores an auditable recommendation decision without embedding input text", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    await recordRecommendationDecision({ query }, {
      userId: "user-a", sourceTrackId: "track-a", profileVersion: "ems-v1", decision: "reject",
      reasonCodes: ["low_similarity"], scoreComponents: { similarity: 0.2 },
    });
    expect(query).toHaveBeenCalledWith(expect.stringMatching(/INSERT INTO user_recommendation_decisions/i), expect.arrayContaining(["user-a", "track-a", "reject"]));
    expect(query.mock.calls[0]?.[1]?.join(" ")).not.toContain("embedding");
  });
});
