BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE track_embeddings (
  track_id UUID PRIMARY KEY REFERENCES music_tracks(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  model_revision TEXT NOT NULL,
  input_hash CHAR(64) NOT NULL,
  input_text TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  embedding vector(768),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error_code TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((status = 'completed') = (embedding IS NOT NULL))
);

CREATE TABLE user_taste_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  model_revision TEXT NOT NULL,
  algorithm_version TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('building', 'completed')),
  unique_track_count INTEGER NOT NULL CHECK (unique_track_count >= 15),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, model_id, model_revision, algorithm_version)
);

CREATE TABLE user_taste_centroids (
  profile_id UUID NOT NULL REFERENCES user_taste_profiles(id) ON DELETE CASCADE,
  cluster_index SMALLINT NOT NULL CHECK (cluster_index BETWEEN 0 AND 3),
  track_count INTEGER NOT NULL CHECK (track_count > 0),
  weight REAL NOT NULL CHECK (weight > 0 AND weight <= 1),
  embedding vector(768) NOT NULL,
  PRIMARY KEY (profile_id, cluster_index)
);

COMMIT;
