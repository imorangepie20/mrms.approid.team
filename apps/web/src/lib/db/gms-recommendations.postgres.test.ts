import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Pool, type PoolClient } from "pg";

import {
  AUDIO_EMBEDDING_DIMENSIONS,
  AUDIO_EMBEDDING_MODEL_ID,
  AUDIO_EMBEDDING_MODEL_REVISION,
  AUDIO_FEATURE_VERSION,
  AUDIO_PREDICTION_LABELS,
  AUDIO_PREDICTION_MODEL_REVISION,
  AUDIO_PREDICTION_VOCABULARY_VERSION,
  AUDIO_TASTE_ALGORITHM_VERSION,
} from "@/lib/recommendations/audio-taste-profile";

import type { TransactionExecutor } from "./music-library";
import {
  preparePersonalizedEmsRecommendations,
  recordRecommendationShadow,
} from "./gms-recommendations";

const databaseUrl = process.env.RECOMMENDATION_SHADOW_TEST_DATABASE_URL;
const suite = describe.runIf(Boolean(databaseUrl));
const userId = "55555555-5555-4555-8555-555555555555";
const textProfileId = "66666666-6666-4666-8666-666666666666";
const audioProfileId = "77777777-7777-4777-8777-777777777777";
const trackIds = [
  "88888888-8888-4888-8888-888888888881",
  "88888888-8888-4888-8888-888888888882",
  "88888888-8888-4888-8888-888888888883",
];
let pool: Pool;
let client: PoolClient;

function vector(dimensions: number, index: number): number[] {
  return Array.from({ length: dimensions }, (_, item) => item === index ? 1 : 0);
}

suite("recommendation shadow PostgreSQL integration", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    client = await pool.connect();
    await client.query(
      "INSERT INTO app_users (id, auth0_subject) VALUES ($1, 'auth0|shadow')",
      [userId],
    );
    await client.query(`
      INSERT INTO user_taste_profiles (
        id, user_id, model_id, model_revision, algorithm_version,
        status, unique_track_count
      ) VALUES ($1, $2, 'text-model', '1', 'taste-v1', 'completed', 15)
    `, [textProfileId, userId]);
    await client.query(`
      INSERT INTO user_taste_centroids (
        profile_id, cluster_index, track_count, weight, embedding
      ) VALUES ($1, 0, 15, 1, $2::vector)
    `, [textProfileId, JSON.stringify(vector(768, 0))]);
    await client.query(`
      INSERT INTO user_audio_taste_profiles (
        id, user_id, feature_version, embedding_model_id,
        embedding_model_revision, prediction_model_revision,
        prediction_vocabulary_version, dimensions, algorithm_version,
        status, eligible_track_count, analyzed_track_count,
        input_fingerprint, summary_features, prediction_features, completed_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        'completed', 1, 1, $10, $11::jsonb, $12::jsonb, now()
      )
    `, [
      audioProfileId,
      userId,
      AUDIO_FEATURE_VERSION,
      AUDIO_EMBEDDING_MODEL_ID,
      AUDIO_EMBEDDING_MODEL_REVISION,
      AUDIO_PREDICTION_MODEL_REVISION,
      AUDIO_PREDICTION_VOCABULARY_VERSION,
      AUDIO_EMBEDDING_DIMENSIONS,
      AUDIO_TASTE_ALGORITHM_VERSION,
      "b".repeat(64),
      JSON.stringify({ rhythm: { bpm: 120 } }),
      JSON.stringify(Object.fromEntries(AUDIO_PREDICTION_LABELS.map((label, index) => [
        label,
        index % 2 === 0 ? 0.8 : 0.2,
      ]))),
    ]);
    await client.query(`
      INSERT INTO user_audio_taste_centroids (
        profile_id, cluster_index, track_count, weight, embedding
      ) VALUES ($1, 0, 1, 1, $2::vector)
    `, [audioProfileId, JSON.stringify(vector(AUDIO_EMBEDDING_DIMENSIONS, 0))]);

    for (const [index, trackId] of trackIds.entries()) {
      await client.query(`
        INSERT INTO ems_tracks (
          id, tidal_id, title, artist, album, duration_ms,
          status, match_confidence, catalog_priority
        ) VALUES ($1, $2, $3, $4, 'Shadow Album', 180000, 'active', $5, $6)
      `, [trackId, `98${index}`, `Shadow ${index}`, index < 2 ? "Artist A" : "Artist B", 0.95 - index * 0.05, 0.9 - index * 0.05]);
      await client.query(`
        INSERT INTO ems_track_embeddings (
          track_id, model_id, model_revision, input_hash,
          status, embedding
        ) VALUES ($1, 'text-model', '1', $2, 'completed', $3::vector)
      `, [trackId, String(index + 1).repeat(64), JSON.stringify(vector(768, index))]);
      await client.query(`
        INSERT INTO ems_availability_events (
          track_id, region, capability, playable
        ) VALUES ($1, 'KR', 'STREAM', true)
      `, [trackId]);
    }

    const analyzedTrackId = trackIds[0];
    await client.query(`
      INSERT INTO ems_track_audio_jobs (
        track_id, feature_version, preview_hash, status, completed_at
      ) VALUES ($1, $2, $3, 'completed', now())
    `, [analyzedTrackId, AUDIO_FEATURE_VERSION, "c".repeat(64)]);
    await client.query(`
      INSERT INTO ems_track_audio_features (
        track_id, feature_version, preview_hash, duration_seconds,
        sample_rate, channel_count, segment_count, coverage_ratio,
        whole_features, segment_features, summary_features, dsp_features
      ) VALUES (
        $1, $2, $3, 30, 16000, 1, 3, 1,
        '{}'::jsonb, '[]'::jsonb, '{}'::jsonb, $4::jsonb
      )
    `, [analyzedTrackId, AUDIO_FEATURE_VERSION, "c".repeat(64), JSON.stringify({ rhythm: { bpm: 118 } })]);
    await client.query(`
      INSERT INTO ems_track_audio_embeddings (
        track_id, model_id, model_revision, preview_hash,
        dimensions, normalization, embedding
      ) VALUES ($1, $2, $3, $4, $5, 'l2', $6::vector)
    `, [
      analyzedTrackId,
      AUDIO_EMBEDDING_MODEL_ID,
      AUDIO_EMBEDDING_MODEL_REVISION,
      "c".repeat(64),
      AUDIO_EMBEDDING_DIMENSIONS,
      JSON.stringify(vector(AUDIO_EMBEDDING_DIMENSIONS, 0)),
    ]);
    for (const [index, label] of AUDIO_PREDICTION_LABELS.entries()) {
      await client.query(`
        INSERT INTO ems_track_audio_predictions (
          track_id, model_id, model_revision, label,
          preview_hash, probability, vocabulary_version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        analyzedTrackId,
        `essentia/msd-musicnn/head-${Math.floor(index / 2)}`,
        AUDIO_PREDICTION_MODEL_REVISION,
        label,
        "c".repeat(64),
        index % 2 === 0 ? 0.75 : 0.25,
        AUDIO_PREDICTION_VOCABULARY_VERSION,
      ]);
    }
  });

  afterAll(async () => {
    client?.release();
    await pool?.end();
  });

  it("keeps baseline serving and stores an exact-version hybrid shadow", async () => {
    const executor = client as unknown as TransactionExecutor;
    const prepared = await preparePersonalizedEmsRecommendations("auth0|shadow", 2, executor);

    expect(prepared.recommendations).toMatchObject({
      profileReady: true,
      profileVersion: "taste-v1",
    });
    expect(prepared.recommendations.tracks).toHaveLength(2);
    expect(prepared.shadow).toMatchObject({
      audioModelRevision: AUDIO_EMBEDDING_MODEL_REVISION,
      audioProfileId,
      candidateCount: 3,
      fallbackUsed: true,
      rankingVersion: "hybrid-v0",
    });
    expect(prepared.shadow?.candidates.filter((candidate) => candidate.audioAvailable))
      .toHaveLength(1);

    await recordRecommendationShadow("auth0|shadow", prepared.shadow!, executor);
    const saved = await client.query(`
      SELECT run.ranking_version, run.candidate_count, run.fallback_used,
             count(candidate.track_id)::integer AS saved_candidates
      FROM user_recommendation_shadow_runs AS run
      INNER JOIN user_recommendation_shadow_candidates AS candidate ON candidate.run_id = run.id
      WHERE run.user_id = $1
      GROUP BY run.id
    `, [userId]);
    expect(saved.rows).toEqual([{
      candidate_count: 3,
      fallback_used: true,
      ranking_version: "hybrid-v0",
      saved_candidates: 3,
    }]);
  });
});
