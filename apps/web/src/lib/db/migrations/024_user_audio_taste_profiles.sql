BEGIN;

CREATE TABLE user_audio_taste_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  profile_version UUID NOT NULL DEFAULT gen_random_uuid(),
  feature_version TEXT NOT NULL,
  embedding_model_id TEXT NOT NULL,
  embedding_model_revision TEXT NOT NULL,
  prediction_model_revision TEXT NOT NULL,
  prediction_vocabulary_version TEXT NOT NULL,
  dimensions INTEGER NOT NULL CHECK (dimensions = 2304),
  algorithm_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('building', 'completed')),
  eligible_track_count INTEGER NOT NULL CHECK (eligible_track_count > 0),
  analyzed_track_count INTEGER NOT NULL CHECK (
    analyzed_track_count > 0 AND analyzed_track_count <= eligible_track_count
  ),
  coverage_ratio DOUBLE PRECISION GENERATED ALWAYS AS (
    analyzed_track_count::DOUBLE PRECISION / eligible_track_count::DOUBLE PRECISION
  ) STORED,
  input_fingerprint CHAR(64) NOT NULL CHECK (input_fingerprint ~ '^[0-9a-f]{64}$'),
  summary_features JSONB NOT NULL,
  prediction_features JSONB NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((status = 'completed') = (completed_at IS NOT NULL)),
  UNIQUE (
    user_id,
    feature_version,
    embedding_model_id,
    embedding_model_revision,
    prediction_model_revision,
    prediction_vocabulary_version,
    algorithm_version
  )
);

CREATE INDEX user_audio_taste_profiles_completed_idx
  ON user_audio_taste_profiles (user_id, completed_at DESC)
  WHERE status = 'completed';

CREATE TABLE user_audio_taste_centroids (
  profile_id UUID NOT NULL REFERENCES user_audio_taste_profiles(id) ON DELETE CASCADE,
  cluster_index SMALLINT NOT NULL CHECK (cluster_index BETWEEN 0 AND 3),
  track_count INTEGER NOT NULL CHECK (track_count > 0),
  weight REAL NOT NULL CHECK (weight > 0 AND weight <= 1),
  embedding vector(2304) NOT NULL,
  PRIMARY KEY (profile_id, cluster_index),
  CHECK (vector_dims(embedding) = 2304)
);

COMMIT;
