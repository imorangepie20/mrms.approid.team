import {
  AUDIO_EMBEDDING_DIMENSIONS,
  AUDIO_EMBEDDING_MODEL_ID,
  AUDIO_EMBEDDING_MODEL_REVISION,
  AUDIO_FEATURE_VERSION,
  AUDIO_PREDICTION_LABELS,
  AUDIO_PREDICTION_MODEL_REVISION,
  AUDIO_PREDICTION_VOCABULARY_VERSION,
  buildAudioTasteProfile,
  type AudioTastePrediction,
  type AudioTasteProfileInput,
  type AudioTasteProfileResult,
} from "@/lib/recommendations/audio-taste-profile";

import type { TransactionExecutor } from "./music-library";
import { getDatabasePool } from "./pool";

type AudioTasteDatasetRow = {
  analyzed_track_id: string | null;
  artist_name?: string | null;
  dimensions?: number | null;
  dsp_features?: unknown;
  eligible_track_count: number;
  embedding?: string | null;
  embedding_model_id?: string | null;
  embedding_model_revision?: string | null;
  feature_version?: string | null;
  feedback_weight?: number | null;
  normalization?: string | null;
  playlist_count?: number | null;
  predictions?: unknown;
  preview_hash?: string | null;
  whole_features?: unknown;
};

type ReleasableExecutor = TransactionExecutor & {
  release?: () => void;
};

export type AudioTasteProfileDataset = {
  eligibleTrackCount: number;
  inputs: AudioTasteProfileInput[];
};

export type AudioTasteProfileRefreshResult = {
  analyzedTrackCount: number;
  coverageRatio: number;
  created: boolean;
  eligibleTrackCount: number;
  profileVersion?: string;
};

function parseVector(value: string): number[] {
  const parsed: unknown = JSON.parse(value);
  if (
    !Array.isArray(parsed)
    || parsed.some((item) => typeof item !== "number" || !Number.isFinite(item))
  ) {
    throw new Error("audio_taste_profile_vector_invalid");
  }
  return parsed;
}

function parseJson<T>(value: unknown): T {
  if (typeof value === "string") return JSON.parse(value) as T;
  return value as T;
}

function mapDatasetInput(row: AudioTasteDatasetRow): AudioTasteProfileInput {
  if (
    !row.analyzed_track_id
    || !row.artist_name
    || row.dimensions === null
    || row.dimensions === undefined
    || !row.dsp_features
    || !row.embedding
    || !row.embedding_model_id
    || !row.embedding_model_revision
    || !row.feature_version
    || row.feedback_weight === null
    || row.feedback_weight === undefined
    || !row.normalization
    || row.playlist_count === null
    || row.playlist_count === undefined
    || !row.predictions
    || !row.preview_hash
    || !row.whole_features
  ) {
    throw new Error("audio_taste_profile_dataset_invalid");
  }
  return {
    artist: row.artist_name,
    dimensions: Number(row.dimensions),
    dspFeatures: parseJson<AudioTasteProfileInput["dspFeatures"]>(row.dsp_features),
    embedding: parseVector(row.embedding),
    embeddingModelId: row.embedding_model_id,
    embeddingModelRevision: row.embedding_model_revision,
    featureVersion: row.feature_version,
    feedbackWeight: Number(row.feedback_weight),
    normalization: row.normalization,
    playlistCount: Number(row.playlist_count),
    predictions: parseJson<AudioTastePrediction[]>(row.predictions),
    previewHash: row.preview_hash,
    trackId: row.analyzed_track_id,
    wholeFeatures: parseJson<AudioTasteProfileInput["wholeFeatures"]>(row.whole_features),
  };
}

export async function loadAudioTasteProfileDataset(
  auth0Subject: string,
  executor?: TransactionExecutor,
): Promise<AudioTasteProfileDataset> {
  const database = executor ?? getDatabasePool();
  const result = await database.query<AudioTasteDatasetRow>(
    `/* audio_taste_profile_dataset */
     WITH user_context AS (
       SELECT u.id
       FROM app_users AS u
       WHERE u.auth0_subject = $1
     ),
     playlist_candidates AS (
       SELECT
         ems.id AS track_id,
         ems.artist AS artist_name,
         count(DISTINCT playlist.id)::integer AS playlist_count,
         CASE WHEN EXISTS (
           SELECT 1
           FROM user_likes AS liked
           WHERE liked.user_id = u.id
             AND liked.entity_type = 'track'
             AND liked.source = 'tidal'
             AND liked.source_id = ems.tidal_id
         ) THEN 2::float8 ELSE 1::float8 END AS feedback_weight
       FROM user_context AS u
       INNER JOIN user_playlists AS playlist
         ON playlist.user_id = u.id AND playlist.selected = true
       INNER JOIN user_playlist_tracks AS playlist_track
         ON playlist_track.playlist_id = playlist.id
       INNER JOIN music_tracks AS library_track
         ON library_track.id = playlist_track.track_id AND library_track.user_id = u.id
       INNER JOIN ems_tracks AS ems
         ON ems.tidal_id = library_track.tidal_track_id AND ems.status = 'active'
       GROUP BY ems.id, ems.artist, ems.tidal_id, u.id
     ),
     positive_feedback_candidates AS (
       SELECT
         ems.id AS track_id,
         ems.artist AS artist_name,
         1::integer AS playlist_count,
         2::float8 AS feedback_weight
       FROM user_context AS u
       INNER JOIN ems_tracks AS ems ON ems.status = 'active'
       WHERE EXISTS (
         SELECT 1
         FROM user_likes AS liked
         WHERE liked.user_id = u.id
           AND liked.entity_type = 'track'
           AND liked.source = 'tidal'
           AND liked.source_id = ems.tidal_id
       ) OR EXISTS (
         SELECT 1
         FROM user_recommendation_decisions AS accepted
         WHERE accepted.user_id = u.id
           AND accepted.source_track_id = ems.id
           AND accepted.decision = 'accept'
       )
     ),
     all_candidates AS (
       SELECT * FROM playlist_candidates
       UNION ALL
       SELECT * FROM positive_feedback_candidates
     ),
     eligible AS (
       SELECT
         candidate.track_id,
         min(candidate.artist_name) AS artist_name,
         max(candidate.playlist_count)::integer AS playlist_count,
         max(candidate.feedback_weight)::float8 AS feedback_weight
       FROM all_candidates AS candidate
       CROSS JOIN user_context AS u
       WHERE NOT EXISTS (
         SELECT 1
         FROM user_recommendation_decisions AS rejected
         WHERE rejected.user_id = u.id
           AND rejected.source_track_id = candidate.track_id
           AND rejected.decision = 'reject'
       )
       GROUP BY candidate.track_id
     ),
     eligible_count AS (
       SELECT count(*)::integer AS value FROM eligible
     ),
     analyzed AS (
       SELECT
         eligible.track_id,
         eligible.artist_name,
         eligible.playlist_count,
         eligible.feedback_weight,
         feature.feature_version,
         feature.preview_hash,
         feature.whole_features,
         feature.dsp_features,
         embedding.model_id AS embedding_model_id,
         embedding.model_revision AS embedding_model_revision,
         embedding.dimensions,
         embedding.normalization,
         embedding.embedding::text AS embedding,
         prediction_set.predictions
       FROM eligible
       INNER JOIN ems_track_audio_jobs AS job
         ON job.track_id = eligible.track_id
        AND job.status = 'completed'
        AND job.feature_version = $2
       INNER JOIN ems_track_audio_features AS feature
         ON feature.track_id = job.track_id
        AND feature.preview_hash = job.preview_hash
        AND feature.feature_version = $2
       INNER JOIN ems_track_audio_embeddings AS embedding
         ON embedding.track_id = job.track_id
        AND embedding.preview_hash = job.preview_hash
        AND embedding.model_id = $3
        AND embedding.model_revision = $4
        AND embedding.dimensions = $5
        AND embedding.normalization = 'l2'
       INNER JOIN LATERAL (
         SELECT jsonb_agg(jsonb_build_object(
           'label', prediction.label,
           'modelId', prediction.model_id,
           'modelRevision', prediction.model_revision,
           'probability', prediction.probability,
           'vocabularyVersion', prediction.vocabulary_version
         ) ORDER BY prediction.label) AS predictions
         FROM ems_track_audio_predictions AS prediction
         WHERE prediction.track_id = job.track_id
           AND prediction.preview_hash = job.preview_hash
           AND prediction.model_id LIKE 'essentia/msd-musicnn/%'
           AND prediction.model_revision = $6
           AND prediction.vocabulary_version = $7
           AND prediction.label = ANY($8::text[])
         HAVING count(*) = cardinality($8::text[])
            AND count(DISTINCT prediction.label) = cardinality($8::text[])
       ) AS prediction_set ON true
     )
     SELECT
       eligible_count.value AS eligible_track_count,
       analyzed.track_id::text AS analyzed_track_id,
       analyzed.artist_name,
       analyzed.playlist_count,
       analyzed.feedback_weight,
       analyzed.feature_version,
       analyzed.preview_hash,
       analyzed.whole_features,
       analyzed.dsp_features,
       analyzed.embedding_model_id,
       analyzed.embedding_model_revision,
       analyzed.dimensions,
       analyzed.normalization,
       analyzed.embedding,
       analyzed.predictions
     FROM eligible_count
     LEFT JOIN analyzed ON true
     ORDER BY analyzed.track_id`,
    [
      auth0Subject,
      AUDIO_FEATURE_VERSION,
      AUDIO_EMBEDDING_MODEL_ID,
      AUDIO_EMBEDDING_MODEL_REVISION,
      AUDIO_EMBEDDING_DIMENSIONS,
      AUDIO_PREDICTION_MODEL_REVISION,
      AUDIO_PREDICTION_VOCABULARY_VERSION,
      [...AUDIO_PREDICTION_LABELS],
    ],
  );
  return {
    eligibleTrackCount: Number(result.rows[0]?.eligible_track_count ?? 0),
    inputs: result.rows
      .filter((row) => row.analyzed_track_id !== null)
      .map(mapDatasetInput),
  };
}

export async function replaceAudioTasteProfile(
  auth0Subject: string,
  result: AudioTasteProfileResult,
  executor?: TransactionExecutor,
): Promise<{ profileVersion: string }> {
  if (!result.centroids.some((centroid) => centroid.clusterIndex === 0)) {
    throw new Error("audio_taste_profile_global_centroid_missing");
  }
  const transaction = (executor
    ?? await getDatabasePool().connect()) as ReleasableExecutor;
  try {
    await transaction.query("BEGIN");
    const profile = await transaction.query<{ id: string; profile_version: string }>(
      `INSERT INTO user_audio_taste_profiles (
         user_id, profile_version, feature_version,
         embedding_model_id, embedding_model_revision,
         prediction_model_revision, prediction_vocabulary_version,
         dimensions, algorithm_version, status,
         eligible_track_count, analyzed_track_count, input_fingerprint,
         summary_features, prediction_features, completed_at, updated_at
       )
       SELECT
         u.id, gen_random_uuid(), $2, $3, $4, $5, $6,
         $7, $8, 'building', $9, $10, $11,
         $12::jsonb, $13::jsonb, NULL, now()
       FROM app_users AS u
       WHERE u.auth0_subject = $1
       ON CONFLICT (
         user_id, feature_version, embedding_model_id, embedding_model_revision,
         prediction_model_revision, prediction_vocabulary_version, algorithm_version
       ) DO UPDATE SET
         profile_version = gen_random_uuid(),
         dimensions = EXCLUDED.dimensions,
         status = 'building',
         eligible_track_count = EXCLUDED.eligible_track_count,
         analyzed_track_count = EXCLUDED.analyzed_track_count,
         input_fingerprint = EXCLUDED.input_fingerprint,
         summary_features = EXCLUDED.summary_features,
         prediction_features = EXCLUDED.prediction_features,
         completed_at = NULL,
         updated_at = now()
       RETURNING id, profile_version::text`,
      [
        auth0Subject,
        result.featureVersion,
        result.embeddingModelId,
        result.embeddingModelRevision,
        result.predictionModelRevision,
        result.predictionVocabularyVersion,
        result.dimensions,
        result.algorithmVersion,
        result.eligibleTrackCount,
        result.analyzedTrackCount,
        result.inputFingerprint,
        JSON.stringify(result.summaryFeatures),
        JSON.stringify(result.predictionFeatures),
      ],
    );
    const row = profile.rows[0];
    if (!row) throw new Error("audio_taste_profile_user_not_found");

    await transaction.query(
      "DELETE FROM user_audio_taste_centroids WHERE profile_id = $1",
      [row.id],
    );
    const centroids = [...result.centroids].sort(
      (left, right) => left.clusterIndex - right.clusterIndex,
    );
    for (const centroid of centroids) {
      await transaction.query(
        `INSERT INTO user_audio_taste_centroids (
           profile_id, cluster_index, track_count, weight, embedding
         ) VALUES ($1, $2, $3, $4, $5::vector)`,
        [
          row.id,
          centroid.clusterIndex,
          centroid.trackCount,
          centroid.weight,
          JSON.stringify(centroid.embedding),
        ],
      );
    }
    await transaction.query(
      `UPDATE user_audio_taste_profiles AS profile
       SET status = 'completed', completed_at = now(), updated_at = now()
       FROM app_users AS u
       WHERE u.auth0_subject = $1
         AND profile.user_id = u.id
         AND profile.id = $2
         AND profile.profile_version = $3::uuid`,
      [auth0Subject, row.id, row.profile_version],
    );
    await transaction.query("COMMIT");
    return { profileVersion: row.profile_version };
  } catch (error) {
    await transaction.query("ROLLBACK");
    throw error;
  } finally {
    if (!executor) transaction.release?.();
  }
}

export async function refreshAudioTasteProfile(
  auth0Subject: string,
  executor?: TransactionExecutor,
): Promise<AudioTasteProfileRefreshResult> {
  const dataset = await loadAudioTasteProfileDataset(auth0Subject, executor);
  if (dataset.inputs.length === 0) {
    return {
      analyzedTrackCount: 0,
      coverageRatio: 0,
      created: false,
      eligibleTrackCount: dataset.eligibleTrackCount,
    };
  }
  const result = buildAudioTasteProfile(dataset.inputs, dataset.eligibleTrackCount);
  const saved = await replaceAudioTasteProfile(auth0Subject, result, executor);
  return {
    analyzedTrackCount: result.analyzedTrackCount,
    coverageRatio: result.coverageRatio,
    created: true,
    eligibleTrackCount: result.eligibleTrackCount,
    profileVersion: saved.profileVersion,
  };
}
