BEGIN;

CREATE TABLE ems_track_audio_jobs (
  track_id UUID PRIMARY KEY REFERENCES ems_tracks(id) ON DELETE CASCADE,
  feature_version TEXT NOT NULL DEFAULT 'essentia-dsp-v1',
  preview_hash CHAR(64),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'completed', 'retryable', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  claimed_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  next_attempt_at TIMESTAMPTZ,
  last_error_code TEXT,
  last_error_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (preview_hash IS NULL OR preview_hash ~ '^[0-9a-f]{64}$'),
  CHECK (status <> 'running' OR (claimed_at IS NOT NULL AND lease_expires_at IS NOT NULL)),
  CHECK (status <> 'completed' OR (preview_hash IS NOT NULL AND completed_at IS NOT NULL))
);

CREATE INDEX ems_track_audio_jobs_ready_idx
  ON ems_track_audio_jobs (status, next_attempt_at, updated_at, track_id)
  WHERE status IN ('pending', 'retryable');

CREATE INDEX ems_track_audio_jobs_expired_lease_idx
  ON ems_track_audio_jobs (lease_expires_at, track_id)
  WHERE status = 'running';

CREATE TABLE ems_track_audio_features (
  track_id UUID NOT NULL REFERENCES ems_tracks(id) ON DELETE CASCADE,
  feature_version TEXT NOT NULL,
  preview_hash CHAR(64) NOT NULL CHECK (preview_hash ~ '^[0-9a-f]{64}$'),
  duration_seconds DOUBLE PRECISION NOT NULL CHECK (duration_seconds > 0 AND duration_seconds <= 30.001),
  sample_rate INTEGER NOT NULL CHECK (sample_rate > 0),
  channel_count INTEGER NOT NULL CHECK (channel_count > 0),
  segment_count INTEGER NOT NULL CHECK (segment_count > 0),
  coverage_ratio DOUBLE PRECISION NOT NULL CHECK (coverage_ratio > 0 AND coverage_ratio <= 1),
  whole_features JSONB NOT NULL,
  segment_features JSONB NOT NULL,
  summary_features JSONB NOT NULL,
  dsp_features JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (track_id, feature_version, preview_hash)
);

CREATE INDEX ems_track_audio_features_hash_idx
  ON ems_track_audio_features (preview_hash, feature_version);

CREATE TABLE ems_track_audio_embeddings (
  track_id UUID NOT NULL REFERENCES ems_tracks(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  model_revision TEXT NOT NULL,
  preview_hash CHAR(64) NOT NULL CHECK (preview_hash ~ '^[0-9a-f]{64}$'),
  dimensions INTEGER NOT NULL CHECK (dimensions = 2304),
  normalization TEXT NOT NULL CHECK (normalization = 'l2'),
  embedding vector(2304) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (track_id, model_id, model_revision, preview_hash),
  CHECK (vector_dims(embedding) = dimensions)
);

CREATE INDEX ems_track_audio_embeddings_hash_idx
  ON ems_track_audio_embeddings (preview_hash, model_id, model_revision);

CREATE TABLE ems_track_audio_predictions (
  track_id UUID NOT NULL REFERENCES ems_tracks(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  model_revision TEXT NOT NULL,
  label TEXT NOT NULL,
  preview_hash CHAR(64) NOT NULL CHECK (preview_hash ~ '^[0-9a-f]{64}$'),
  probability DOUBLE PRECISION NOT NULL CHECK (probability >= 0 AND probability <= 1),
  vocabulary_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (track_id, model_id, model_revision, label, preview_hash)
);

CREATE INDEX ems_track_audio_predictions_hash_idx
  ON ems_track_audio_predictions (preview_hash, model_id, model_revision);

COMMIT;
