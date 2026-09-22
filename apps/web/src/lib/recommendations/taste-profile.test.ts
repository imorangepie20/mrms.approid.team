import { describe, expect, it } from "vitest";

import {
  buildTasteProfile,
  type TasteProfileInput,
} from "./taste-profile";

function inputs(
  count: number,
  embedding: number[],
  prefix = "track",
): TasteProfileInput[] {
  return Array.from({ length: count }, (_, index) => ({
    artist: `${prefix}-artist-${index}`,
    embedding,
    playlistCount: 1,
    trackId: `${prefix}-${String(index).padStart(2, "0")}`,
  }));
}

describe("taste profile", () => {
  it("rejects 14 unique tracks", () => {
    expect(() => buildTasteProfile(inputs(14, [1, 0])))
      .toThrow("taste_profile_minimum_not_met");
  });

  it.each([15, 59])(
    "returns one normalized centroid for %i tracks",
    (count) => {
      const result = buildTasteProfile(inputs(count, [3, 4]));

      expect(result.uniqueTrackCount).toBe(count);
      expect(result.centroids).toHaveLength(1);
      expect(result.centroids[0]).toMatchObject({
        clusterIndex: 0,
        trackCount: count,
        weight: 1,
      });
      expect(result.centroids[0].embedding[0]).toBeCloseTo(0.6, 12);
      expect(result.centroids[0].embedding[1]).toBeCloseTo(0.8, 12);
    },
  );

  it("counts one vector once while increasing its capped playlist weight", () => {
    const weighted = [
      {
        artist: "featured",
        embedding: [1, 0],
        playlistCount: 99,
        trackId: "featured",
      },
      ...inputs(14, [0, 1], "other"),
    ];

    const result = buildTasteProfile(weighted);

    expect(result.uniqueTrackCount).toBe(15);
    expect(result.centroids[0].trackCount).toBe(15);
    expect(result.centroids[0].embedding[0])
      .toBeCloseTo(0.12403473458920847, 12);
    expect(result.centroids[0].embedding[1])
      .toBeCloseTo(0.9922778767136677, 12);
    expect(
      buildTasteProfile([{ ...weighted[0], playlistCount: 4 }, ...weighted.slice(1)])
        .centroids[0].embedding,
    ).toEqual(result.centroids[0].embedding);
  });

  it("reduces but does not erase a repeated artist's total influence", () => {
    const repeated = inputs(9, [1, 0], "repeat").map((item) => ({
      ...item,
      artist: "same-artist",
    }));
    const varied = inputs(6, [0, 1], "varied");

    expect(buildTasteProfile([...repeated, ...varied]).centroids[0].embedding)
      .toEqual([0.4472135954999579, 0.8944271909999159]);
  });

  it("returns the same clusters and order for the fixed seed", () => {
    const separated = [
      ...inputs(20, [1, 0, 0], "a"),
      ...inputs(20, [0, 1, 0], "b"),
      ...inputs(20, [0, 0, 1], "c"),
    ];

    expect(buildTasteProfile(separated, 20260922))
      .toEqual(buildTasteProfile(separated, 20260922));
  });

  it("accepts clusters only when every cluster has at least 10 tracks and silhouette is at least 0.10", () => {
    const separated = [
      ...inputs(20, [1, 0, 0], "a"),
      ...inputs(20, [0, 1, 0], "b"),
      ...inputs(20, [0, 0, 1], "c"),
    ];

    const accepted = buildTasteProfile(separated);
    expect(accepted.centroids).toEqual([
      {
        clusterIndex: 0,
        embedding: [
          0.5773502691896257,
          0.5773502691896257,
          0.5773502691896257,
        ],
        trackCount: 60,
        weight: 1,
      },
      {
        clusterIndex: 1,
        embedding: [1, 0, 0],
        trackCount: 20,
        weight: 1 / 3,
      },
      {
        clusterIndex: 2,
        embedding: [0, 1, 0],
        trackCount: 20,
        weight: 1 / 3,
      },
      {
        clusterIndex: 3,
        embedding: [0, 0, 1],
        trackCount: 20,
        weight: 1 / 3,
      },
    ]);

    const undersized = [
      ...inputs(55, [1, 0], "large"),
      ...inputs(5, [0, 1], "small"),
    ];
    expect(buildTasteProfile(undersized).centroids).toHaveLength(1);
  });

  it("falls back to one centroid for 60 near-identical vectors", () => {
    const result = buildTasteProfile(inputs(60, [1, 0]));

    expect(result.centroids).toEqual([{
      clusterIndex: 0,
      embedding: [1, 0],
      trackCount: 60,
      weight: 1,
    }]);
  });
});
