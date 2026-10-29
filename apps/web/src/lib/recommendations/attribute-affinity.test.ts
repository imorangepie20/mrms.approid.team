import { describe, expect, it } from "vitest";

import {
  buildAttributeDistribution,
  placeExplorationSlots,
  scoreAttributeFit,
  type AttributeFit,
  type DistributionInput,
} from "./attribute-affinity";

function items(language: string, count: number, genre = "pop", weight = 1): DistributionInput[] {
  return Array.from({ length: count }, () => ({ genreBuckets: { [genre]: 1 }, language, weight }));
}

describe("buildAttributeDistribution", () => {
  it("excludes zxx and unknown from language shares and sample", () => {
    const d = buildAttributeDistribution([...items("eng", 30), ...items("zxx", 50), ...items("unknown", 5)]);
    expect(d.languageSample).toBe(30);
    expect(d.languages).toEqual({ eng: 1 });
  });

  it("reject lowers but never removes a language", () => {
    const d = buildAttributeDistribution([
      ...items("kor", 5),
      ...items("kor", 8, "pop", -0.5),
      ...items("eng", 10),
    ]);
    expect(d.languages.kor).toBeGreaterThanOrEqual(0);
    const rejectOnly = buildAttributeDistribution(items("kor", 8, "pop", -0.5));
    expect(rejectOnly.languages.kor ?? 0).toBe(0);
    expect(rejectOnly.languageSample).toBe(0);
  });
});

describe("scoreAttributeFit", () => {
  const dist = buildAttributeDistribution(items("eng", 30));

  it("penalizes a language absent from the distribution down to the floor", () => {
    const fit = scoreAttributeFit(dist, { genreBuckets: { pop: 1 }, language: "por" });
    expect(fit.multiplier).toBe(0.55);
    expect(fit.reasonCodes).toContain("language_mismatch");
    expect(fit.mismatchKey).toBe("lang:por");
  });

  it("does not penalize a language above the full share", () => {
    const fit = scoreAttributeFit(dist, { genreBuckets: { pop: 1 }, language: "eng" });
    expect(fit.multiplier).toBe(1);
    expect(fit.mismatchKey).toBeNull();
  });

  it("treats zxx as neutral", () => {
    const fit = scoreAttributeFit(dist, { genreBuckets: { pop: 1 }, language: "zxx" });
    expect(fit.languageFit).toBeNull();
    expect(fit.multiplier).toBe(1);
  });

  it("disables a dimension below minimum sample", () => {
    const small = buildAttributeDistribution(items("eng", 19));
    const fit = scoreAttributeFit(small, { genreBuckets: { pop: 1 }, language: "por" });
    expect(fit.languageFit).toBeNull();
    expect(fit.genreFit).toBeNull();
    expect(fit.multiplier).toBe(1);
  });

  it("penalizes a rare genre with genre floor and key", () => {
    const fit = scoreAttributeFit(dist, { genreBuckets: { trot: 1 }, language: "eng" });
    expect(fit.multiplier).toBe(0.7);
    expect(fit.mismatchKey).toBe("genre:trot");
    expect(fit.reasonCodes).toEqual(["genre_mismatch"]);
  });

  it("returns neutral fit for a null candidate", () => {
    expect(scoreAttributeFit(dist, null)).toEqual({
      genreFit: null, languageFit: null, mismatchKey: null, multiplier: 1, reasonCodes: [],
    });
  });
});

const NEUTRAL: AttributeFit = { genreFit: null, languageFit: null, mismatchKey: null, multiplier: 1, reasonCodes: [] };
const mismatch = (key: string): AttributeFit => ({
  genreFit: null, languageFit: 0, mismatchKey: key, multiplier: 0.55, reasonCodes: ["language_mismatch"],
});

function candidates(count: number, mismatches: Record<number, string> = {}) {
  return Array.from({ length: count }, (_, index) => ({
    baseScore: 1 - index / 1000,
    fit: mismatches[index] ? mismatch(mismatches[index]) : NEUTRAL,
    id: `t${String(index).padStart(3, "0")}`,
  }));
}

describe("placeExplorationSlots", () => {
  it("fills exploration slots only when distinct mismatches exist", () => {
    const out = placeExplorationSlots(candidates(30, { 26: "lang:por", 27: "lang:por" }), 24);
    expect(out).toHaveLength(24);
    expect(out.filter((c) => c.exploration)).toHaveLength(1);
    expect(out[7].exploration).toBe(true);
    expect(out[7].id).toBe("t026");
    expect(out[7].fit.reasonCodes).toContain("exploration");
  });

  it("places exploration at positions 8 and 16", () => {
    const out = placeExplorationSlots(candidates(30, { 26: "lang:por", 27: "lang:por", 28: "genre:trot" }), 24);
    expect(out).toHaveLength(24);
    expect(out.map((c, i) => (c.exploration ? i + 1 : 0)).filter(Boolean)).toEqual([8, 16]);
    expect(out[7].id).toBe("t026");
    expect(out[15].id).toBe("t028");
  });

  it("does not use exploration below limit 6", () => {
    const out = placeExplorationSlots(candidates(10, { 8: "lang:por", 9: "genre:trot" }), 5);
    expect(out.map((c) => c.id)).toEqual(["t000", "t001", "t002", "t003", "t004"]);
    expect(out.some((c) => c.exploration)).toBe(false);
  });

  it("returns min(limit, ranked length) when candidates are scarce", () => {
    expect(placeExplorationSlots(candidates(10), 24)).toHaveLength(10);
  });
});
