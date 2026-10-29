import { describe, expect, it, vi } from "vitest";

import type { TransactionExecutor } from "./music-library";
import {
  isTerminalAudioCandidateFailure,
  listPersonalizedEmsRecommendations,
  preparePersonalizedEmsRecommendations,
  rankEmsCandidates,
  recordRecommendationShadow,
  saveRecommendationDecision,
  selectPreparedPersonalizedRecommendations,
} from "./gms-recommendations";
import { loadUserAttributeDistributionInputs } from "./user-attribute-distribution";

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
  return {
    query: query as unknown as TransactionExecutor["query"],
    queryMock: query,
  };
}

type AttributeRow = {
  genre_buckets: Record<string, number> | null;
  language: string | null;
  language_source?: string | null;
  taxonomy_version: string | null;
  weight: number;
};

function englishDistribution(count = 30, language = "eng"): AttributeRow[] {
  return Array.from({ length: count }, () => ({
    genre_buckets: {},
    language,
    language_source: "musicbrainz_release",
    taxonomy_version: "genre-v1",
    weight: 1,
  }));
}

function attributeCandidate(
  id: string,
  similarityGlobal: number,
  language: string | null,
  sourceRank: number,
) {
  return {
    ...candidateRows[2],
    artist: `Artist ${id}`,
    genre_buckets: language === null ? null : {},
    id,
    language,
    similarity_cluster: null,
    similarity_global: similarityGlobal,
    source_rank: sourceRank,
    tidal_id: `tidal-${id}`,
    title: `Track ${id}`,
  };
}

function attributeExecutor(
  rows: unknown[],
  distribution: AttributeRow[] | Error,
) {
  let candidateParams: unknown[] | undefined;
  const query = vi.fn(async (sql: string, params?: unknown[]) => {
    if (sql.includes("/* recommendation_profiles */")) return { rows: [profileRow] };
    if (sql.includes("/* user_attribute_distribution */")) {
      if (distribution instanceof Error) throw distribution;
      return { rows: distribution };
    }
    if (sql.includes("SAVEPOINT")) return { rows: [] };
    if (sql.includes("WITH centroid_similarity")) candidateParams = params;
    return { rows };
  });
  return {
    candidateParams: () => candidateParams,
    executor: { query: query as unknown as TransactionExecutor["query"] },
    queryMock: query,
  };
}

describe("GMS personalized recommendation repository", () => {
  it("classifies only failed terminal preview access codes as discardable", () => {
    expect(isTerminalAudioCandidateFailure("failed", "preview_forbidden")).toBe(true);
    expect(isTerminalAudioCandidateFailure("failed", "preview_info_rejected")).toBe(true);
    expect(isTerminalAudioCandidateFailure("failed", "preview_unavailable")).toBe(true);
    expect(isTerminalAudioCandidateFailure("retryable", "preview_forbidden")).toBe(false);
    expect(isTerminalAudioCandidateFailure("failed", "analysis_unavailable")).toBe(false);
  });

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
    expect(executor.queryMock.mock.calls[1]?.[0]).toMatch(
      /COALESCE\(e\.mb_first_release_date, e\.tidal_album_release_date, e\.release_date\)/i,
    );
    expect(executor.queryMock.mock.calls[1]?.[0]).not.toMatch(/now\(\) - e\.updated_at/i);
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
    expect(query.mock.calls[1]?.[0]).toMatch(
      /FROM user_recommendation_exposures AS exposure[\s\S]*exposure\.user_id = \$2[\s\S]*exposure\.track_id = e\.id/i,
    );
  });

  it("keeps the served baseline but discards and backfills terminal audio candidates", async () => {
    const audioProfile = {
      ...profileRow,
      audio_model_revision: "2",
      audio_prediction_features: { happy: 0.8, non_happy: 0.2 },
      audio_profile_id: "audio-profile-a",
      audio_profile_version: "44444444-4444-4444-8444-444444444444",
      audio_summary_features: { rhythm: { bpm: 120 } },
    };
    const rows = [
      {
        ...candidateRows[0],
        audio_discarded: true,
        audio_error_code: "preview_info_rejected",
        audio_job_status: "failed",
        source_rank: 1,
      },
      { ...candidateRows[1], source_rank: 2 },
      { ...candidateRows[2], source_rank: 3 },
      { ...candidateRows[2], id: "track-c", source_rank: 4, tidal_id: "tidal-c", title: "Track C" },
      { ...candidateRows[2], id: "track-d", source_rank: 5, tidal_id: "tidal-d", title: "Track D" },
      { ...candidateRows[2], id: "track-f", source_rank: 6, tidal_id: "tidal-f", title: "Track F" },
    ];
    let candidateParams: unknown[] | undefined;
    const query = vi.fn(async (sql: string, params?: unknown[]) => {
      if (sql.includes("WITH centroid_similarity")) candidateParams = params;
      return {
        rows: sql.includes("/* recommendation_profiles */") ? [audioProfile] : rows,
      };
    });

    const prepared = await preparePersonalizedEmsRecommendations(
      "auth0|listener",
      1,
      { query: query as unknown as TransactionExecutor["query"] },
    );

    expect(prepared.recommendations.tracks[0]?.id).toBe("track-a");
    expect(prepared.shadow?.servedBaselineTrackIds).toEqual(["track-a"]);
    expect(prepared.shadow?.audioDiscardedCandidates).toEqual([{
      errorCode: "preview_info_rejected",
      trackId: "track-a",
    }]);
    expect(prepared.shadow?.backfilledTrackIds).toEqual(["track-f"]);
    expect(prepared.shadow?.candidates).toHaveLength(5);
    expect(prepared.shadow?.candidates.map((candidate) => candidate.trackId))
      .not.toContain("track-a");
    expect(prepared.shadow?.candidates.map((candidate) => candidate.trackId))
      .toContain("track-f");
    expect(query.mock.calls[1]?.[0]).toMatch(/eligible_source_rank <= \$3/i);
    expect(candidateParams?.[5]).toEqual([
      "preview_forbidden",
      "preview_info_rejected",
      "preview_unavailable",
    ]);
  });

  it("serves hybrid only for an allowlisted subject with complete component coverage", async () => {
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
        : candidateRows.map((row) => ({
            ...row,
            audio_similarity_cluster: row.audio_similarity_cluster ?? 0.8,
            audio_similarity_global: row.audio_similarity_global ?? 0.8,
            candidate_bpm: row.candidate_bpm ?? 110,
            candidate_predictions: row.candidate_predictions
              ?? { happy: 0.7, non_happy: 0.3 },
          })),
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

  it("keeps baseline ranking unchanged when the pool grows", async () => {
    const rows = [
      ...candidateRows.map((row, index) => ({ ...row, source_rank: index + 1 })),
      ...Array.from({ length: 7 }, (_, index) =>
        attributeCandidate(`filler-${index}`, 0.3, "eng", index + 4)),
      attributeCandidate("beyond-pool", 0.99, "eng", 11),
    ];
    const harness = attributeExecutor(rows, englishDistribution());

    const prepared = await preparePersonalizedEmsRecommendations(
      "auth0|listener",
      2,
      harness.executor,
    );

    expect(harness.candidateParams()?.[2]).toBe(50);
    expect(prepared.recommendations.tracks.map((track) => track.id)).toEqual(["track-a", "track-b"]);
    expect(prepared.recommendations.tracks[0]?.recommendation.scoreComponents)
      .not.toHaveProperty("attributeMultiplier");
    expect(prepared.shadow?.candidates.map((candidate) => candidate.trackId))
      .not.toContain("beyond-pool");
    expect(prepared.attributeRecommendations?.tracks[0]?.id).toBe("beyond-pool");

    const capped = attributeExecutor(rows, englishDistribution());
    await preparePersonalizedEmsRecommendations("auth0|listener", 24, capped.executor);
    expect(capped.candidateParams()?.[2]).toBe(600);
  });

  it("keeps candidates without attributes", async () => {
    const harness = attributeExecutor(
      [attributeCandidate("plain", 0.8, null, 1)],
      englishDistribution(),
    );

    const prepared = await preparePersonalizedEmsRecommendations(
      "auth0|listener",
      2,
      harness.executor,
    );

    const track = prepared.attributeRecommendations?.tracks[0];
    expect(track?.id).toBe("plain");
    expect(track?.recommendation.scoreComponents.attributeMultiplier).toBe(1);
    expect(track?.recommendation.scoreComponents).not.toHaveProperty("languageFit");
    expect(track?.recommendation.scoreComponents).not.toHaveProperty("genreFit");
  });

  it("demotes mismatched language in baseline-v2", async () => {
    const harness = attributeExecutor(
      [
        attributeCandidate("a", 0.9, "por", 1),
        attributeCandidate("b", 0.8, "eng", 2),
      ],
      englishDistribution(30),
    );

    const prepared = await preparePersonalizedEmsRecommendations(
      "auth0|listener",
      2,
      harness.executor,
    );

    expect(prepared.recommendations.tracks[0]?.id).toBe("a");
    const v2 = prepared.attributeRecommendations;
    expect(v2?.rankingVersion).toBe("baseline-v2");
    expect(v2?.tracks.map((track) => track.id)).toEqual(["b", "a"]);
    expect(v2?.tracks[1]?.recommendation).toMatchObject({
      rankingVersion: "baseline-v2",
      reasonCodes: expect.arrayContaining(["taste_match", "language_mismatch"]),
      scoreComponents: expect.objectContaining({
        attributeMultiplier: 0.55,
        languageFit: 0,
      }),
    });
    expect(v2?.attributeProfile).toEqual({
      genreSample: 0,
      genres: {},
      languageCoverage: 1,
      languageSample: 30,
      languageSources: { musicbrainz_release: 30 },
      languages: { eng: 1 },
      taxonomyVersion: "genre-v1",
    });
    expect(prepared.recommendations).not.toHaveProperty("attributeProfile");
  });

  it("skips baseline-v2 when language coverage is below the gate and genres are too sparse", async () => {
    const harness = attributeExecutor(
      [attributeCandidate("a", 0.9, "por", 1), attributeCandidate("b", 0.8, "eng", 2)],
      [...englishDistribution(20), ...englishDistribution(80, "unknown")],
    );

    const prepared = await preparePersonalizedEmsRecommendations("auth0|listener", 2, harness.executor);

    expect(prepared.attributeRecommendations ?? null).toBeNull();
  });

  it("marks exploration tracks", async () => {
    const rows = [
      ...Array.from({ length: 8 }, (_, index) =>
        attributeCandidate(`eng-${index}`, 0.8 - index * 0.01, "eng", index + 4)),
      attributeCandidate("por-1", 0.95, "por", 1),
      attributeCandidate("por-2", 0.94, "por", 2),
      attributeCandidate("jpn-1", 0.93, "jpn", 3),
    ];
    const harness = attributeExecutor(rows, englishDistribution());

    const prepared = await preparePersonalizedEmsRecommendations(
      "auth0|listener",
      6,
      harness.executor,
    );

    const tracks = prepared.attributeRecommendations?.tracks ?? [];
    expect(tracks).toHaveLength(6);
    const explorers = tracks.filter((track) =>
      track.recommendation.reasonCodes.includes("exploration"));
    expect(explorers.map((track) => track.id)).toEqual(["por-1", "jpn-1"]);
    expect(tracks.findIndex((track) => track.id === "por-1")).toBe(1);
    expect(tracks.findIndex((track) => track.id === "jpn-1")).toBe(3);
  });

  it("returns null attribute recommendations below sample", async () => {
    const harness = attributeExecutor(
      [attributeCandidate("a", 0.9, "por", 1)],
      englishDistribution(19),
    );

    const prepared = await preparePersonalizedEmsRecommendations(
      "auth0|listener",
      2,
      harness.executor,
    );

    expect(prepared.attributeRecommendations).toBeNull();
    expect(prepared.recommendations.tracks[0]?.id).toBe("a");
  });

  it("keeps baseline when the attribute distribution query fails", async () => {
    const harness = attributeExecutor(
      [attributeCandidate("a", 0.9, "por", 1)],
      new Error("relation does not exist"),
    );

    const prepared = await preparePersonalizedEmsRecommendations(
      "auth0|listener",
      2,
      harness.executor,
    );

    expect(prepared.attributeRecommendations).toBeNull();
    expect(prepared.recommendations.tracks.map((track) => track.id)).toEqual(["a"]);
    const sql = harness.queryMock.mock.calls.map(([text]) => text);
    expect(sql).toContain("SAVEPOINT user_attribute_distribution");
    expect(sql).toContain("ROLLBACK TO SAVEPOINT user_attribute_distribution");
  });

  it("loads MMS and decided-track attribute inputs once per track", async () => {
    const query = vi.fn(async () => ({ rows: [
      { genre_buckets: { pop: 1 }, language: "eng", language_source: "script", taxonomy_version: "genre-v1", weight: 1 },
      { genre_buckets: "{\"rock\":0.5}", language: "kor", taxonomy_version: "genre-v1", weight: -0.5 },
      { genre_buckets: {}, language: null, taxonomy_version: null, weight: 1 },
    ] }));

    const inputs = await loadUserAttributeDistributionInputs("user-a", {
      query: query as unknown as TransactionExecutor["query"],
    });

    expect(inputs).toEqual([
      { genreBuckets: { pop: 1 }, language: "eng", languageSource: "script", taxonomyVersion: "genre-v1", weight: 1 },
      { genreBuckets: { rock: 0.5 }, language: "kor", languageSource: null, taxonomyVersion: "genre-v1", weight: -0.5 },
    ]);
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toMatch(/\/\* user_attribute_distribution \*\//);
    expect(sql).toMatch(/playlist\.selected = true/);
    expect(sql).toMatch(/decision\.decision IN \('accept', 'reject'\)/);
    expect(sql).toMatch(/GROUP BY decision\.source_track_id/);
    expect(sql.match(/attribute\.language_source/g)).toHaveLength(2);
    expect(params).toEqual(["user-a", -0.5]);
  });

  it("uses the 24-track batch size by default", async () => {
    const harness = attributeExecutor([attributeCandidate("a", 0.9, "eng", 1)], []);

    await preparePersonalizedEmsRecommendations("auth0|listener", undefined, harness.executor);
    expect(harness.candidateParams()?.[2]).toBe(600);

    const listed = attributeExecutor([attributeCandidate("a", 0.9, "eng", 1)], []);
    await listPersonalizedEmsRecommendations("auth0|listener", undefined, listed.executor);
    expect(listed.candidateParams()?.[2]).toBe(600);
  });

  it("does not count an accepted EMS track again when it is already in the MMS", async () => {
    const query = vi.fn(async () => ({ rows: [] }));

    await loadUserAttributeDistributionInputs("user-a", {
      query: query as unknown as TransactionExecutor["query"],
    });

    const [sql] = query.mock.calls[0] as unknown as [string];
    const decisionArm = sql.slice(sql.indexOf("UNION ALL"));
    expect(decisionArm).toMatch(
      /NOT EXISTS \([\s\S]*FROM music_tracks AS owned[\s\S]*playlist\.selected = true[\s\S]*owned\.user_id = \$1[\s\S]*owned\.tidal_track_id = ems\.tidal_id/,
    );
    expect(decisionArm).toMatch(/INNER JOIN ems_tracks AS ems ON ems\.id = decided\.source_track_id/);
  });

  it("serves baseline-v2 when requested", async () => {
    const harness = attributeExecutor(
      [
        attributeCandidate("a", 0.9, "por", 1),
        attributeCandidate("b", 0.8, "eng", 2),
      ],
      englishDistribution(),
    );
    const prepared = await preparePersonalizedEmsRecommendations(
      "auth0|listener",
      2,
      harness.executor,
    );

    const selected = selectPreparedPersonalizedRecommendations("auth0|listener", prepared, {
      GMS_RANKING_VERSION: "baseline-v2",
    });

    expect(selected.recommendations.rankingVersion).toBe("baseline-v2");
    expect(selected.recommendations.tracks[0]?.id).toBe("b");
    expect(selected.serving).toMatchObject({
      fallbackReason: null,
      servedRankingVersion: "baseline-v2",
    });

    const unavailable = selectPreparedPersonalizedRecommendations(
      "auth0|listener",
      { ...prepared, attributeRecommendations: null },
      { GMS_RANKING_VERSION: "baseline-v2" },
    );
    expect(unavailable.recommendations.rankingVersion).toBe("baseline");
    expect(unavailable.serving.fallbackReason).toBe("attribute_profile_unavailable");
  });

  it("keeps baseline semantics in served_baseline_track_ids when baseline-v2 is served", async () => {
    const harness = attributeExecutor(
      [
        attributeCandidate("a", 0.9, "por", 1),
        attributeCandidate("b", 0.8, "eng", 2),
      ],
      englishDistribution(),
    );
    const prepared = await preparePersonalizedEmsRecommendations("auth0|listener", 2, harness.executor);
    const selected = selectPreparedPersonalizedRecommendations("auth0|listener", prepared, {
      GMS_RANKING_VERSION: "baseline-v2",
    });

    // 실제 제공 목록은 batch·exposure(ranking_version = baseline-v2)에 남고, shadow run 컬럼은
    // 비교 기준인 baseline 응답을 그대로 기록한다(027 정의).
    expect(selected.serving.servedRankingVersion).toBe("baseline-v2");
    expect(selected.recommendations.tracks.map((track) => track.id)).toEqual(["b", "a"]);
    expect(prepared.shadow?.servedBaselineTrackIds).toEqual(["a", "b"]);
    expect(prepared.shadow?.servedBaselineTrackIds)
      .toEqual(prepared.recommendations.tracks.map((track) => track.id));
  });

  it("records a shadow run and candidates atomically", async () => {
    const prepared = await preparePersonalizedEmsRecommendations(
      "auth0|listener",
      2,
      executorWithRows(),
    );
    expect(prepared.shadow).not.toBeNull();
    const query = vi.fn(async (sql: string, _params?: unknown[]) => ({
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
    expect(sql.at(-2)).toMatch(/prune_recommendation_shadow_runs/i);
    expect(query.mock.calls.at(-2)?.[1]).toEqual(["user-a", 30, 100]);
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
