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
} from "@/lib/recommendations/audio-taste-profile";

import type { TransactionExecutor } from "./music-library";
import {
  loadAudioTasteProfileDataset,
  refreshAudioTasteProfile,
} from "./audio-taste-profiles";

const databaseUrl = process.env.AUDIO_TASTE_PROFILE_TEST_DATABASE_URL;
const suite = describe.runIf(Boolean(databaseUrl));
const userId = "22222222-2222-4222-8222-222222222222";
const trackId = "33333333-3333-4333-8333-333333333333";
let pool: Pool;
let client: PoolClient;

suite("audio taste profile PostgreSQL integration", () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    client = await pool.connect();
    await client.query(
      "INSERT INTO app_users (id, auth0_subject) VALUES ($1, 'auth0|audio-profile')",
      [userId],
    );
    await client.query(`
      INSERT INTO ems_tracks (
        id, tidal_id, title, artist, album, duration_ms, status, match_confidence
      ) VALUES ($1, '987654', 'Profile Track', 'Profile Artist', 'Profile Album', 180000, 'active', 1)
    `, [trackId]);
    await client.query(`
      INSERT INTO user_likes (
        user_id, entity_type, source, source_id, title, subtitle
      ) VALUES ($1, 'track', 'tidal', '987654', 'Profile Track', 'Profile Artist')
    `, [userId]);
    await client.query(`
      INSERT INTO ems_track_audio_jobs (
        track_id, feature_version, preview_hash, status, completed_at
      ) VALUES ($1, $2, $3, 'completed', now())
    `, [trackId, AUDIO_FEATURE_VERSION, "a".repeat(64)]);
    await client.query(`
      INSERT INTO ems_track_audio_features (
        track_id, feature_version, preview_hash, duration_seconds,
        sample_rate, channel_count, segment_count, coverage_ratio,
        whole_features, segment_features, summary_features, dsp_features
      ) VALUES ($1, $2, $3, 30, 16000, 1, 3, 1, $4::jsonb, '[]'::jsonb, '{}'::jsonb, $5::jsonb)
    `, [
      trackId,
      AUDIO_FEATURE_VERSION,
      "a".repeat(64),
      JSON.stringify({ clippingRatio: 0, peakLevel: 0.8, rmsEnergy: 0.2, zeroCrossingRate: 0.1 }),
      JSON.stringify({
        errors: [],
        mfcc: { coefficientMeans: [1, 2], coefficientStandardDeviations: [0.1, 0.2] },
        rhythm: { beatCount: 60, bpm: 120, confidence: 2 },
        spectral: {
          centroidHz: { mean: 1_000 },
          flatnessDb: { mean: -20 },
          rolloffHz: { mean: 4_000 },
        },
        tonal: { key: "C", mode: "major", strength: 0.8 },
      }),
    ]);
    const embedding = Array.from(
      { length: AUDIO_EMBEDDING_DIMENSIONS },
      (_, index) => index === 0 ? 1 : 0,
    );
    await client.query(`
      INSERT INTO ems_track_audio_embeddings (
        track_id, model_id, model_revision, preview_hash,
        dimensions, normalization, embedding
      ) VALUES ($1, $2, $3, $4, $5, 'l2', $6::vector)
    `, [
      trackId,
      AUDIO_EMBEDDING_MODEL_ID,
      AUDIO_EMBEDDING_MODEL_REVISION,
      "a".repeat(64),
      AUDIO_EMBEDDING_DIMENSIONS,
      JSON.stringify(embedding),
    ]);
    for (const [index, label] of AUDIO_PREDICTION_LABELS.entries()) {
      await client.query(`
        INSERT INTO ems_track_audio_predictions (
          track_id, model_id, model_revision, label,
          preview_hash, probability, vocabulary_version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        trackId,
        `essentia/msd-musicnn/head-${Math.floor(index / 2)}`,
        AUDIO_PREDICTION_MODEL_REVISION,
        label,
        "a".repeat(64),
        index % 2 === 0 ? 0.75 : 0.25,
        AUDIO_PREDICTION_VOCABULARY_VERSION,
      ]);
    }
  });

  afterAll(async () => {
    client?.release();
    await pool?.end();
  });

  it("builds a completed user-scoped profile and permanently excludes a rejected track", async () => {
    const executor = client as unknown as TransactionExecutor;
    const dataset = await loadAudioTasteProfileDataset("auth0|audio-profile", executor);
    expect(dataset).toMatchObject({ eligibleTrackCount: 1 });
    expect(dataset.inputs).toHaveLength(1);

    await expect(refreshAudioTasteProfile("auth0|audio-profile", executor))
      .resolves.toMatchObject({
        analyzedTrackCount: 1,
        coverageRatio: 1,
        created: true,
        eligibleTrackCount: 1,
      });
    const saved = await client.query(`
      SELECT profile.status, profile.profile_version, centroid.cluster_index,
             vector_dims(centroid.embedding) AS dimensions
      FROM user_audio_taste_profiles AS profile
      INNER JOIN user_audio_taste_centroids AS centroid ON centroid.profile_id = profile.id
      WHERE profile.user_id = $1
    `, [userId]);
    expect(saved.rows).toEqual([expect.objectContaining({
      cluster_index: 0,
      dimensions: AUDIO_EMBEDDING_DIMENSIONS,
      status: "completed",
    })]);

    await client.query(`
      INSERT INTO user_recommendation_decisions (
        user_id, source_track_id, profile_version, decision
      ) VALUES ($1, $2, 'integration', 'reject')
    `, [userId, trackId]);
    await expect(loadAudioTasteProfileDataset("auth0|audio-profile", executor))
      .resolves.toEqual({ eligibleTrackCount: 0, inputs: [] });
  });
});
