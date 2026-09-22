import { describe, expect, it, vi } from "vitest";

import type { TransactionExecutor } from "./music-library";
import {
  listPersonalizedEmsRecommendations,
  rankEmsCandidates,
  saveRecommendationDecision,
} from "./gms-recommendations";

const profileRow = {
  algorithm_version: "ems-v1",
  id: "profile-a",
  user_id: "user-a",
};

const candidateRows = [
  {
    album: "Album A",
    artist: "Artist A",
    artwork_url: "https://img.test/a.jpg",
    catalog_priority: 0.9,
    duration_ms: 180000,
    freshness: 0.8,
    id: "track-a",
    match_confidence: 0.95,
    similarity_cluster: 0.92,
    similarity_global: 0.7,
    tidal_id: "tidal-a",
    title: "Track A",
  },
  {
    album: "Album A 2",
    artist: "Artist A",
    artwork_url: "https://img.test/a2.jpg",
    catalog_priority: 0.9,
    duration_ms: 181000,
    freshness: 0.8,
    id: "track-a2",
    match_confidence: 0.95,
    similarity_cluster: 0.9,
    similarity_global: 0.72,
    tidal_id: "tidal-a2",
    title: "Track A2",
  },
  {
    album: "Album B",
    artist: "Artist B",
    artwork_url: "https://img.test/b.jpg",
    catalog_priority: 0.75,
    duration_ms: 182000,
    freshness: 0.7,
    id: "track-b",
    match_confidence: 0.9,
    similarity_cluster: 0.84,
    similarity_global: 0.74,
    tidal_id: "tidal-b",
    title: "Track B",
  },
];

function executorWithRows(rows = candidateRows) {
  const query = vi.fn(async (sql: string) => ({
    rows: sql.includes("user_taste_profiles")
      ? [profileRow]
      : rows,
  }));
  return { query: query as unknown as TransactionExecutor["query"] };
}

describe("GMS personalized recommendation repository", () => {
  it("returns no candidates until a completed profile exists", async () => {
    const query = vi.fn(async () => ({ rows: [] }));

    const result = await listPersonalizedEmsRecommendations(
      "auth0|listener",
      12,
      { query: query as unknown as TransactionExecutor["query"] },
    );

    expect(result).toEqual({ profileReady: false, profileVersion: null, tracks: [] });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("maps completed EMS candidates and applies deterministic artist diversity", async () => {
    const executor = executorWithRows();

    const result = await listPersonalizedEmsRecommendations("auth0|listener", 2, executor);

    expect(result.profileReady).toBe(true);
    expect(result.profileVersion).toBe("ems-v1");
    expect(result.tracks.map((track) => track.id)).toEqual(["track-a", "track-b"]);
    expect(result.tracks[0]).toMatchObject({
      album: "Album A",
      artworkUrl: "https://img.test/a.jpg",
      tidalTrackId: "tidal-a",
      title: "Track A",
    });
    expect(result.tracks[0]?.recommendation.scoreComponents).toMatchObject({
      similarity: expect.any(Number),
      diversity: 1,
    });
  });

  it("keeps the approved similarity contract and stable tie ordering", () => {
    const ranked = rankEmsCandidates(candidateRows, 3);

    expect(ranked.map((candidate) => candidate.id)).toEqual([
      "track-a",
      "track-b",
      "track-a2",
    ]);
    expect(ranked[0]?.recommendation.scoreComponents.similarity).toBeCloseTo(
      0.3 * 0.7 + 0.7 * 0.92,
      6,
    );
  });

  it("records a decision through the authenticated user's database row", async () => {
    const query = vi.fn(async () => ({ rows: [{ id: "decision-a" }] }));

    await saveRecommendationDecision(
      "auth0|listener",
      {
        decision: "reject",
        profileVersion: "ems-v1",
        reasonCodes: ["low_similarity"],
        scoreComponents: { similarity: 0.2 },
        sourceTrackId: "track-a",
      },
      { query: query as unknown as TransactionExecutor["query"] },
    );

    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/INSERT INTO user_recommendation_decisions[\s\S]*SELECT u\.id/i),
      expect.arrayContaining(["auth0|listener", "track-a", "ems-v1", "reject"]),
    );
  });
});
