export const AUDIO_ANALYSIS_FEATURE_VERSION = "essentia-dsp-v1";

export const AUDIO_ANALYSIS_STATUSES = [
  "missing",
  "pending",
  "running",
  "completed",
  "retryable",
  "failed",
] as const;

export type AudioAnalysisStatus = (typeof AUDIO_ANALYSIS_STATUSES)[number];

export type QueryExecutor = {
  query<Row extends Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: Row[] }>;
};

export type AudioAnalysisTrackSummary = {
  id: string;
  tidalTrackId: string;
  title: string;
  artist: string;
  album: string | null;
  status: AudioAnalysisStatus;
  featureVersion: string | null;
  previewHash: string | null;
  durationSeconds: number | null;
  dimensions: number | null;
  attemptCount: number;
  lastErrorCode: string | null;
  completedAt: string | null;
  updatedAt: string | null;
};

export type AudioAnalysisAdminData = {
  coverage: {
    activeTrackCount: number;
    stagedTrackCount: number;
    completedTrackCount: number;
    stagedRatio: number;
    completedRatio: number;
  };
  statusCounts: Record<AudioAnalysisStatus, number>;
  featureVersions: Array<{ featureVersion: string; completedTrackCount: number }>;
  embeddingModelVersions: Array<{
    modelId: string;
    modelRevision: string;
    dimensions: number;
    completedTrackCount: number;
  }>;
  predictionModelVersions: Array<{
    modelId: string;
    modelRevision: string;
    vocabularyVersion: string;
    completedTrackCount: number;
  }>;
  errorCodes: Array<{
    status: "retryable" | "failed";
    code: string;
    count: number;
  }>;
  throughput: {
    completedLast24Hours: number;
    days: Array<{ date: string; completedCount: number }>;
  };
  benchmarks: Array<{
    environment: string;
    input: string;
    coldLatencySeconds: number;
    warmLatencySeconds: number;
    peakRssGib: number;
    source: string;
  }>;
  tracks: {
    totalCount: number;
    page: number;
    limit: number;
    nextPage: number | null;
    items: AudioAnalysisTrackSummary[];
  };
};

export type AudioAnalysisTrackDetail = AudioAnalysisTrackSummary & {
  job: {
    claimedAt: string | null;
    leaseExpiresAt: string | null;
    nextAttemptAt: string | null;
    lastErrorAt: string | null;
  } | null;
  feature: {
    previewHash: string;
    featureVersion: string;
    durationSeconds: number;
    sampleRate: number;
    channelCount: number;
    segmentCount: number;
    coverageRatio: number;
    whole: unknown;
    segments: unknown;
    summary: unknown;
    dsp: unknown;
    createdAt: string;
  } | null;
  embeddings: Array<{
    modelId: string;
    modelRevision: string;
    previewHash: string;
    dimensions: number;
    normalization: string;
    createdAt: string;
  }>;
  predictions: Array<{
    modelId: string;
    modelRevision: string;
    vocabularyVersion: string;
    label: string;
    probability: number;
  }>;
};

export type AudioAnalysisListOptions = {
  query?: string;
  status?: AudioAnalysisStatus;
  page?: number;
  limit?: number;
};

type CountRow = { status: string; count: number };
type FeatureVersionRow = { feature_version: string; completed_track_count: number };
type EmbeddingVersionRow = { model_id: string; model_revision: string; dimensions: number; completed_track_count: number };
type PredictionVersionRow = { model_id: string; model_revision: string; vocabulary_version: string; completed_track_count: number };
type ErrorCodeRow = { status: "retryable" | "failed"; error_code: string; count: number };
type ThroughputRow = { day: string; completed_count: number };
type Last24HoursRow = { completed_count: number };
type TrackRow = {
  id: string;
  tidal_id: string;
  title: string;
  artist: string;
  album: string | null;
  status: AudioAnalysisStatus;
  feature_version: string | null;
  preview_hash: string | null;
  duration_seconds: number | null;
  dimensions: number | null;
  attempt_count: number | null;
  last_error_code: string | null;
  completed_at: string | null;
  updated_at: string | null;
};

const BENCHMARKS = [{
  environment: "Zorin production target",
  input: "30초 440 Hz WAV · essentia-dsp-v1",
  coldLatencySeconds: 20.225,
  warmLatencySeconds: 14.039,
  peakRssGib: 1.878,
  source: "docs/changes/2026-09-29-audio-model-artifact-integration.md",
}];

function emptyStatusCounts(): Record<AudioAnalysisStatus, number> {
  return { missing: 0, pending: 0, running: 0, completed: 0, retryable: 0, failed: 0 };
}

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

function mapTrack(row: TrackRow): AudioAnalysisTrackSummary {
  return {
    id: row.id,
    tidalTrackId: row.tidal_id,
    title: row.title,
    artist: row.artist,
    album: row.album,
    status: row.status,
    featureVersion: row.feature_version,
    previewHash: row.preview_hash,
    durationSeconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
    dimensions: row.dimensions === null ? null : Number(row.dimensions),
    attemptCount: Number(row.attempt_count ?? 0),
    lastErrorCode: row.last_error_code,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };
}

function fillThroughput(rows: ThroughputRow[], today = new Date()) {
  const counts = new Map(rows.map((row) => [row.day, Number(row.completed_count)]));
  const days: Array<{ date: string; completedCount: number }> = [];
  const utcToday = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(utcToday);
    date.setUTCDate(date.getUTCDate() - offset);
    const key = date.toISOString().slice(0, 10);
    days.push({ date: key, completedCount: counts.get(key) ?? 0 });
  }
  return days;
}

function trackFilters(options: AudioAnalysisListOptions) {
  const values: unknown[] = [];
  const clauses = ["track.status = 'active'"];
  const query = options.query?.trim() ?? "";
  if (query) {
    values.push(`%${query}%`);
    clauses.push(`(track.title ILIKE $${values.length} OR track.artist ILIKE $${values.length} OR COALESCE(track.album, '') ILIKE $${values.length})`);
  }
  if (options.status === "missing") {
    clauses.push("job.track_id IS NULL");
  } else if (options.status) {
    values.push(options.status);
    clauses.push(`job.status = $${values.length}`);
  }
  return { values, where: clauses.join(" AND ") };
}

async function listAudioAnalysisTracks(options: AudioAnalysisListOptions, executor: QueryExecutor) {
  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const limit = Math.min(50, Math.max(1, Math.trunc(options.limit ?? 20)));
  const offset = (page - 1) * limit;
  const filters = trackFilters(options);
  const listValues = [...filters.values, limit, offset];
  const limitParam = filters.values.length + 1;
  const offsetParam = filters.values.length + 2;
  const [countResult, trackResult] = await Promise.all([
    executor.query<{ total_count: number }>(`/* audio_analysis_admin_track_count */
      SELECT count(*)::int AS total_count
        FROM ems_tracks AS track
        LEFT JOIN ems_track_audio_jobs AS job ON job.track_id = track.id
       WHERE ${filters.where}`, filters.values),
    executor.query<TrackRow>(`/* audio_analysis_admin_tracks */
      SELECT track.id, track.tidal_id, track.title, track.artist, track.album,
             COALESCE(job.status, 'missing') AS status,
             job.feature_version, job.preview_hash, job.attempt_count,
             job.last_error_code, job.completed_at, job.updated_at,
             feature.duration_seconds,
             embedding.dimensions
        FROM ems_tracks AS track
        LEFT JOIN ems_track_audio_jobs AS job ON job.track_id = track.id
        LEFT JOIN LATERAL (
          SELECT value.duration_seconds
            FROM ems_track_audio_features AS value
           WHERE value.track_id = track.id
             AND value.feature_version = job.feature_version
             AND value.preview_hash = job.preview_hash
           ORDER BY value.created_at DESC
           LIMIT 1
        ) AS feature ON true
        LEFT JOIN LATERAL (
          SELECT value.dimensions
            FROM ems_track_audio_embeddings AS value
           WHERE value.track_id = track.id
             AND value.preview_hash = job.preview_hash
           ORDER BY value.created_at DESC
           LIMIT 1
        ) AS embedding ON true
       WHERE ${filters.where}
       ORDER BY job.updated_at DESC NULLS LAST, track.updated_at DESC, track.id
       LIMIT $${limitParam} OFFSET $${offsetParam}`, listValues),
  ]);
  const totalCount = Number(countResult.rows[0]?.total_count ?? 0);
  return {
    totalCount,
    page,
    limit,
    nextPage: offset + trackResult.rows.length < totalCount ? page + 1 : null,
    items: trackResult.rows.map(mapTrack),
  };
}

export async function getAudioAnalysisAdminData(
  options: AudioAnalysisListOptions,
  executor: QueryExecutor,
  now = new Date(),
): Promise<AudioAnalysisAdminData> {
  const [counts, featureVersions, embeddingVersions, predictionVersions, errorCodes, throughput, last24Hours, tracks] = await Promise.all([
    executor.query<CountRow>(`/* audio_analysis_admin_status_counts */
      SELECT COALESCE(job.status, 'missing') AS status, count(*)::int AS count
        FROM ems_tracks AS track
        LEFT JOIN ems_track_audio_jobs AS job ON job.track_id = track.id
       WHERE track.status = 'active'
       GROUP BY COALESCE(job.status, 'missing')`),
    executor.query<FeatureVersionRow>(`/* audio_analysis_admin_feature_versions */
      SELECT feature.feature_version, count(DISTINCT feature.track_id)::int AS completed_track_count
        FROM ems_track_audio_features AS feature
        JOIN ems_track_audio_jobs AS job
          ON job.track_id = feature.track_id
         AND job.feature_version = feature.feature_version
         AND job.preview_hash = feature.preview_hash
         AND job.status = 'completed'
        JOIN ems_tracks AS track ON track.id = feature.track_id AND track.status = 'active'
       GROUP BY feature.feature_version
       ORDER BY completed_track_count DESC, feature.feature_version`),
    executor.query<EmbeddingVersionRow>(`/* audio_analysis_admin_embedding_versions */
      SELECT embedding.model_id, embedding.model_revision, embedding.dimensions,
             count(DISTINCT embedding.track_id)::int AS completed_track_count
        FROM ems_track_audio_embeddings AS embedding
        JOIN ems_track_audio_jobs AS job
          ON job.track_id = embedding.track_id
         AND job.preview_hash = embedding.preview_hash
         AND job.status = 'completed'
        JOIN ems_tracks AS track ON track.id = embedding.track_id AND track.status = 'active'
       GROUP BY embedding.model_id, embedding.model_revision, embedding.dimensions
       ORDER BY completed_track_count DESC, embedding.model_id, embedding.model_revision`),
    executor.query<PredictionVersionRow>(`/* audio_analysis_admin_prediction_versions */
      SELECT prediction.model_id, prediction.model_revision, prediction.vocabulary_version,
             count(DISTINCT prediction.track_id)::int AS completed_track_count
        FROM ems_track_audio_predictions AS prediction
        JOIN ems_track_audio_jobs AS job
          ON job.track_id = prediction.track_id
         AND job.preview_hash = prediction.preview_hash
         AND job.status = 'completed'
        JOIN ems_tracks AS track ON track.id = prediction.track_id AND track.status = 'active'
       GROUP BY prediction.model_id, prediction.model_revision, prediction.vocabulary_version
       ORDER BY completed_track_count DESC, prediction.model_id, prediction.model_revision`),
    executor.query<ErrorCodeRow>(`/* audio_analysis_admin_error_codes */
      SELECT job.status, COALESCE(job.last_error_code, 'unknown') AS error_code, count(*)::int AS count
        FROM ems_track_audio_jobs AS job
        JOIN ems_tracks AS track ON track.id = job.track_id AND track.status = 'active'
       WHERE job.status IN ('retryable', 'failed')
       GROUP BY job.status, COALESCE(job.last_error_code, 'unknown')
       ORDER BY job.status, count DESC, error_code`),
    executor.query<ThroughputRow>(`/* audio_analysis_admin_throughput */
      SELECT job.completed_at::date::text AS day, count(*)::int AS completed_count
        FROM ems_track_audio_jobs AS job
        JOIN ems_tracks AS track ON track.id = job.track_id AND track.status = 'active'
       WHERE job.status = 'completed' AND job.completed_at >= current_date - interval '6 days'
       GROUP BY job.completed_at::date
       ORDER BY job.completed_at::date`),
    executor.query<Last24HoursRow>(`/* audio_analysis_admin_last_24_hours */
      SELECT count(*)::int AS completed_count
        FROM ems_track_audio_jobs AS job
        JOIN ems_tracks AS track ON track.id = job.track_id AND track.status = 'active'
       WHERE job.status = 'completed' AND job.completed_at >= now() - interval '24 hours'`),
    listAudioAnalysisTracks(options, executor),
  ]);

  const statusCounts = emptyStatusCounts();
  for (const row of counts.rows) {
    if (AUDIO_ANALYSIS_STATUSES.includes(row.status as AudioAnalysisStatus)) {
      statusCounts[row.status as AudioAnalysisStatus] = Number(row.count);
    }
  }
  const activeTrackCount = Object.values(statusCounts).reduce((sum, count) => sum + count, 0);
  const stagedTrackCount = activeTrackCount - statusCounts.missing;
  const completedTrackCount = statusCounts.completed;

  return {
    coverage: {
      activeTrackCount,
      stagedTrackCount,
      completedTrackCount,
      stagedRatio: ratio(stagedTrackCount, activeTrackCount),
      completedRatio: ratio(completedTrackCount, activeTrackCount),
    },
    statusCounts,
    featureVersions: featureVersions.rows.map((row) => ({ featureVersion: row.feature_version, completedTrackCount: Number(row.completed_track_count) })),
    embeddingModelVersions: embeddingVersions.rows.map((row) => ({ modelId: row.model_id, modelRevision: row.model_revision, dimensions: Number(row.dimensions), completedTrackCount: Number(row.completed_track_count) })),
    predictionModelVersions: predictionVersions.rows.map((row) => ({ modelId: row.model_id, modelRevision: row.model_revision, vocabularyVersion: row.vocabulary_version, completedTrackCount: Number(row.completed_track_count) })),
    errorCodes: errorCodes.rows.map((row) => ({ status: row.status, code: row.error_code, count: Number(row.count) })),
    throughput: { completedLast24Hours: Number(last24Hours.rows[0]?.completed_count ?? 0), days: fillThroughput(throughput.rows, now) },
    benchmarks: BENCHMARKS,
    tracks,
  };
}

type FeatureRow = {
  preview_hash: string;
  feature_version: string;
  duration_seconds: number;
  sample_rate: number;
  channel_count: number;
  segment_count: number;
  coverage_ratio: number;
  whole_features: unknown;
  segment_features: unknown;
  summary_features: unknown;
  dsp_features: unknown;
  created_at: string;
};

type EmbeddingRow = { model_id: string; model_revision: string; preview_hash: string; dimensions: number; normalization: string; created_at: string };
type PredictionRow = { model_id: string; model_revision: string; vocabulary_version: string; label: string; probability: number };
type DetailTrackRow = TrackRow & { claimed_at: string | null; lease_expires_at: string | null; next_attempt_at: string | null; last_error_at: string | null };

export async function getAudioAnalysisTrackDetail(trackId: string, executor: QueryExecutor): Promise<AudioAnalysisTrackDetail> {
  const [trackResult, featureResult, embeddingResult, predictionResult] = await Promise.all([
    executor.query<DetailTrackRow>(`/* audio_analysis_admin_track_detail */
      SELECT track.id, track.tidal_id, track.title, track.artist, track.album,
             COALESCE(job.status, 'missing') AS status,
             job.feature_version, job.preview_hash, job.attempt_count,
             job.last_error_code, job.completed_at, job.updated_at,
             job.claimed_at, job.lease_expires_at, job.next_attempt_at, job.last_error_at,
             feature.duration_seconds, embedding.dimensions
        FROM ems_tracks AS track
        LEFT JOIN ems_track_audio_jobs AS job ON job.track_id = track.id
        LEFT JOIN LATERAL (
          SELECT value.duration_seconds FROM ems_track_audio_features AS value
           WHERE value.track_id = track.id AND value.feature_version = job.feature_version AND value.preview_hash = job.preview_hash
           ORDER BY value.created_at DESC LIMIT 1
        ) AS feature ON true
        LEFT JOIN LATERAL (
          SELECT value.dimensions FROM ems_track_audio_embeddings AS value
           WHERE value.track_id = track.id AND value.preview_hash = job.preview_hash
           ORDER BY value.created_at DESC LIMIT 1
        ) AS embedding ON true
       WHERE track.id = $1 AND track.status = 'active'`, [trackId]),
    executor.query<FeatureRow>(`/* audio_analysis_admin_track_feature */
      SELECT feature.preview_hash, feature.feature_version, feature.duration_seconds,
             feature.sample_rate, feature.channel_count, feature.segment_count, feature.coverage_ratio,
             feature.whole_features, feature.segment_features, feature.summary_features, feature.dsp_features,
             feature.created_at
        FROM ems_track_audio_features AS feature
        JOIN ems_track_audio_jobs AS job
          ON job.track_id = feature.track_id AND job.preview_hash = feature.preview_hash AND job.feature_version = feature.feature_version
       WHERE feature.track_id = $1
       ORDER BY feature.created_at DESC LIMIT 1`, [trackId]),
    executor.query<EmbeddingRow>(`/* audio_analysis_admin_track_embeddings */
      SELECT embedding.model_id, embedding.model_revision, embedding.preview_hash,
             embedding.dimensions, embedding.normalization, embedding.created_at
        FROM ems_track_audio_embeddings AS embedding
        JOIN ems_track_audio_jobs AS job ON job.track_id = embedding.track_id AND job.preview_hash = embedding.preview_hash
       WHERE embedding.track_id = $1
       ORDER BY embedding.model_id, embedding.model_revision`, [trackId]),
    executor.query<PredictionRow>(`/* audio_analysis_admin_track_predictions */
      SELECT prediction.model_id, prediction.model_revision, prediction.vocabulary_version,
             prediction.label, prediction.probability
        FROM ems_track_audio_predictions AS prediction
        JOIN ems_track_audio_jobs AS job ON job.track_id = prediction.track_id AND job.preview_hash = prediction.preview_hash
       WHERE prediction.track_id = $1
       ORDER BY prediction.model_id, prediction.probability DESC, prediction.label`, [trackId]),
  ]);
  const row = trackResult.rows[0];
  if (!row) throw new Error("audio_analysis_track_not_found");
  const track = mapTrack(row);
  const feature = featureResult.rows[0];
  return {
    ...track,
    job: row.feature_version === null ? null : {
      claimedAt: row.claimed_at,
      leaseExpiresAt: row.lease_expires_at,
      nextAttemptAt: row.next_attempt_at,
      lastErrorAt: row.last_error_at,
    },
    feature: feature ? {
      previewHash: feature.preview_hash,
      featureVersion: feature.feature_version,
      durationSeconds: Number(feature.duration_seconds),
      sampleRate: Number(feature.sample_rate),
      channelCount: Number(feature.channel_count),
      segmentCount: Number(feature.segment_count),
      coverageRatio: Number(feature.coverage_ratio),
      whole: feature.whole_features,
      segments: feature.segment_features,
      summary: feature.summary_features,
      dsp: feature.dsp_features,
      createdAt: feature.created_at,
    } : null,
    embeddings: embeddingResult.rows.map((embedding) => ({
      modelId: embedding.model_id,
      modelRevision: embedding.model_revision,
      previewHash: embedding.preview_hash,
      dimensions: Number(embedding.dimensions),
      normalization: embedding.normalization,
      createdAt: embedding.created_at,
    })),
    predictions: predictionResult.rows.map((prediction) => ({
      modelId: prediction.model_id,
      modelRevision: prediction.model_revision,
      vocabularyVersion: prediction.vocabulary_version,
      label: prediction.label,
      probability: Number(prediction.probability),
    })),
  };
}

export async function requeueAudioAnalysisTrack(trackId: string, featureVersion: string, executor: QueryExecutor) {
  if (featureVersion !== AUDIO_ANALYSIS_FEATURE_VERSION) throw new Error("invalid_audio_analysis_feature_version");
  const result = await executor.query<{
    requested_track_id: string;
    track_id: string | null;
    status: "pending" | null;
    feature_version: string | null;
    updated_at: string | null;
  }>(`/* audio_analysis_admin_requeue */
    WITH target AS (
      SELECT track.id
        FROM ems_tracks AS track
       WHERE track.id = $1 AND track.status = 'active' AND track.tidal_id ~ '^[0-9]+$'
    ), queued AS (
      INSERT INTO ems_track_audio_jobs (track_id, feature_version, status, updated_at)
      SELECT target.id, $2, 'pending', now() FROM target
      ON CONFLICT (track_id) DO UPDATE SET
        feature_version = EXCLUDED.feature_version,
        preview_hash = NULL,
        status = 'pending',
        attempt_count = 0,
        claimed_at = NULL,
        lease_expires_at = NULL,
        next_attempt_at = NULL,
        last_error_code = NULL,
        last_error_at = NULL,
        completed_at = NULL,
        updated_at = now()
      WHERE ems_track_audio_jobs.status <> 'running'
      RETURNING track_id::text, status, feature_version, updated_at
    )
    SELECT target.id::text AS requested_track_id, queued.track_id, queued.status,
           queued.feature_version, queued.updated_at
      FROM target LEFT JOIN queued ON true`, [trackId, featureVersion]);
  const row = result.rows[0];
  if (!row) throw new Error("audio_analysis_track_not_found");
  if (!row.track_id || !row.status || !row.feature_version || !row.updated_at) throw new Error("audio_analysis_track_busy");
  return { trackId: row.track_id, status: row.status, featureVersion: row.feature_version, updatedAt: row.updated_at };
}
