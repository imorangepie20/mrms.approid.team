import { describe, expect, it, vi } from "vitest";

import type { TransactionExecutor } from "./music-library";
import {
  listPersonalizedEmsRecommendations,
  preparePersonalizedEmsRecommendations,
  rankEmsCandidates,
  recordRecommendationShadow,
  saveRecommendationDecision,
  selectPreparedPersonalizedRecommendations,
} from "./gms-recommendations";

const profileRow = {
  algorithm_version: "ems-v1",
  audio_model_revision: null,
  audio_prediction_features: null,
  audio_profile_id: null,
  audio_profile_version: null,
  audio_summary_features: null,
  id: "profile-a",
  user_id: "user-a",
};

const candidateRows = [
  {
    album: "Album A",
    artist: "Artist A",
    artwork_url: "https://img.test/a.jpg",
    audio_similarity_cluster: 0.8,
    audio_similarity_global: 0.7,
    candidate_bpm: 120,
    candidate_predictions: { happy: 0.8, non_happy: 0.2 },
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
    audio_similarity_cluster: null,
    audio_similarity_global: null,
    candidate_bpm: null,
    candidate_predictions: null,
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
    audio_similarity_cluster: 0.75,
    audio_similarity_global: 0.72,
    candidate_bpm: 100,
    candidate_predictions: { happy: 0.6, non_happy: 0.4 },
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

    expect(result).toEqual({
      profileReady: false,
      profileVersion: null,
      rankingVersion: "baseline",
      tracks: [],
    });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("maps completed EMS candidates and applies deterministic artist diversity", async () => {
    const executor = executorWithRows();

    const result = await listPersonalizedEmsRecommendations("auth0|listener", 2, executor);

    expect(result.profileReady).toBe(true);
    expect(result.profileVersion).toBe("ems-v1");
    expect(result.rankingVersion).toBe("baseline");
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

  it("builds a separate hybrid shadow payload without changing baseline response", async () => {
    const audioProfile = {
      ...profileRow,
      audio_model_revision: "2",
      audio_prediction_features: { happy: 0.8, non_happy: 0.2 },
      audio_profile_id: "audio-profile-a",
      audio_profile_version: "44444444-4444-4444-8444-444444444444",
      audio_summary_features: { rhythm: { bpm: 120 } },
    };
    const query = vi.fn(async (sql: string) => ({
      rows: sql.includes("/* recommendation_profiles */")
        ? [audioProfile]
        : candidateRows,
    }));

    const result = await preparePersonalizedEmsRecommendations(
      "auth0|listener",
      2,
      { query: query as unknown as TransactionExecutor["query"] },
    );

    expect(result.recommendations.tracks.map((track) => track.id)).toEqual(["track-a", "track-b"]);
    expect(result.shadow).toMatchObject({
      audioModelRevision: "2",
      audioProfileId: "audio-profile-a",
      audioProfileVersion: "44444444-4444-4444-8444-444444444444",
      candidateCount: 3,
      rankingVersion: "hybrid-v0",
      requestedLimit: 2,
      textProfileId: "profile-a",
      textProfileVersion: "ems-v1",
      userId: "user-a",
    });
    expect(result.shadow?.candidates).toHaveLength(3);
    expect(result.hybridRecommendations).toMatchObject({
      profileReady: true,
      profileVersion: "ems-v1",
      rankingVersion: "hybrid-v0",
    });
    expect(result.hybridRecommendations?.tracks[0]?.recommendation).toMatchObject({
      rankingVersion: "hybrid-v0",
      scoreComponents: expect.objectContaining({
        hybridSimilarity: expect.any(Number),
        selectorScore: expect.any(Number),
      }),
    });
    for (const track of result.hybridRecommendations?.tracks ?? []) {
      expect(Object.values(track.recommendation.scoreComponents)
        .every((component) => typeof component === "number" && Number.isFinite(component)))
        .toBe(true);
    }
    expect(result.shadow?.candidates.find((candidate) => candidate.trackId === "track-a"))
      .toMatchObject({
      audioAvailable: true,
      components: expect.objectContaining({ text: expect.any(Number) }),
      trackId: "track-a",
    });
    expect(query.mock.calls[1]?.[0]).toMatch(/audio_profile\.embedding_model_revision/i);
    expect(query.mock.calls[1]?.[0]).toMatch(/prediction\.model_revision = audio_profile\.prediction_model_revision/i);
  });

  it("serves hybrid only for an allowlisted subject meeting the explicit coverage gate", async () => {
    const audioProfile = {
      ...profileRow,
      audio_model_revision: "2",
      audio_prediction_features: { happy: 0.8, non_happy: 0.2 },
      audio_profile_id: "audio-profile-a",
      audio_profile_version: "44444444-4444-4444-8444-444444444444",
      audio_summary_features: { rhythm: { bpm: 120 } },
    };
    const query = vi.fn(async (sql: string) => ({
      rows: sql.includes("/* recommendation_profiles */")
        ? [audioProfile]
        : candidateRows,
    }));
    const prepared = await preparePersonalizedEmsRecommendations(
      "auth0|listener",
      2,
      { query: query as unknown as TransactionExecutor["query"] },
    );
    const baseline = selectPreparedPersonalizedRecommendations("auth0|listener", prepared, {});
    const hybrid = selectPreparedPersonalizedRecommendations("auth0|listener", prepared, {
      GMS_HYBRID_AUTH0_SUBJECTS: "auth0|listener",
      GMS_HYBRID_MIN_AUDIO_COVERAGE: "0.3",
      GMS_RANKING_VERSION: "hybrid-v0",
    });

    expect(baseline.recommendations.rankingVersion).toBe("baseline");
    expect(baseline.serving.fallbackReason).toBe("ranking_disabled");
    expect(hybrid.recommendations.rankingVersion).toBe("hybrid-v0");
    expect(hybrid.serving).toMatchObject({
      fallbackReason: null,
      servedRankingVersion: "hybrid-v0",
    });
  });

  it("records a shadow run and candidates atomically", async () => {
    const prepared = await preparePersonalizedEmsRecommendations(
      "auth0|listener",
      2,
      executorWithRows(),
    );
    expect(prepared.shadow).not.toBeNull();
    const query = vi.fn(async (sql: string) => ({
      rows: sql.includes("INSERT INTO user_recommendation_shadow_runs")
        ? [{ id: "shadow-run-a" }]
        : [],
    }));

    await recordRecommendationShadow(
      "auth0|listener",
      prepared.shadow!,
      {
        fallbackReason: "ranking_disabled",
        minimumAudioCoverage: null,
        requestedRankingVersion: "baseline",
        servedRankingVersion: "baseline",
      },
      { query: query as unknown as TransactionExecutor["query"] },
    );

    const sql = query.mock.calls.map(([text]) => text);
    expect(sql[0]).toBe("BEGIN");
    expect(sql.at(-1)).toBe("COMMIT");
    expect(sql.filter((text) => text.includes("INSERT INTO user_recommendation_shadow_candidates")))
      .toHaveLength(candidateRows.length);
  });

  it("rolls back shadow recording without affecting the recommendation result", async () => {
    const prepared = await preparePersonalizedEmsRecommendations(
      "auth0|listener",
      2,
      executorWithRows(),
    );
    const query = vi.fn(async (sql: string) => {
      if (sql.includes("INSERT INTO user_recommendation_shadow_runs")) {
        return { rows: [{ id: "shadow-run-a" }] };
      }
      if (sql.includes("INSERT INTO user_recommendation_shadow_candidates")) {
        throw new Error("shadow write failed");
      }
      return { rows: [] };
    });

    await expect(recordRecommendationShadow(
      "auth0|listener",
      prepared.shadow!,
      {
        fallbackReason: "ranking_disabled",
        minimumAudioCoverage: null,
        requestedRankingVersion: "baseline",
        servedRankingVersion: "baseline",
      },
      { query: query as unknown as TransactionExecutor["query"] },
    )).rejects.toThrow("shadow write failed");
    expect(query.mock.calls.map(([sql]) => sql)).toContain("ROLLBACK");
  });

  it("records a decision through the authenticated user's database row", async () => {
    const query = vi.fn(async () => ({ rows: [{ id: "decision-a" }] }));

    await saveRecommendationDecision(
      "auth0|listener",
      {
        decision: "reject",
        profileVersion: "ems-v1",
        rankingVersion: "baseline",
        reasonCodes: ["low_similarity"],
        scoreComponents: { similarity: 0.2 },
        sourceTrackId: "track-a",
      },
      { query: query as unknown as TransactionExecutor["query"] },
    );

    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/INSERT INTO user_recommendation_decisions[\s\S]*SELECT u\.id/i),
      expect.arrayContaining(["auth0|listener", "track-a", "ems-v1", "baseline", "reject"]),
    );
  });
});
