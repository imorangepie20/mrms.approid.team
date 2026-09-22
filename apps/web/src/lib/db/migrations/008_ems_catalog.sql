BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE ems_ingest_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type TEXT NOT NULL CHECK (run_type IN ('musicbrainz_snapshot', 'tidal_resolve', 'user_import')),
  snapshot_id TEXT,
  manifest_sha256 CHAR(64),
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed', 'rolled_back')),
  request_budget INTEGER NOT NULL DEFAULT 0 CHECK (request_budget >= 0),
  requested_count INTEGER NOT NULL DEFAULT 0 CHECK (requested_count >= 0),
  matched_count INTEGER NOT NULL DEFAULT 0 CHECK (matched_count >= 0),
  checkpoint_sequence BIGINT NOT NULL DEFAULT 0 CHECK (checkpoint_sequence >= 0),
  error_code TEXT,
  heartbeat_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ems_ingest_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES ems_ingest_runs(id) ON DELETE CASCADE,
  sequence_no BIGINT NOT NULL CHECK (sequence_no >= 0),
  candidate_key TEXT NOT NULL,
  recording_mbid TEXT,
  isrc TEXT,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT,
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms > 0),
  release_date DATE,
  artist_region TEXT,
  selection_bucket TEXT NOT NULL CHECK (selection_bucket IN ('canonical', 'diversity', 'long_tail', 'user_import')),
  selection_score DOUBLE PRECISION NOT NULL CHECK (selection_score >= 0 AND selection_score <= 1),
  resolver_status TEXT NOT NULL DEFAULT 'pending' CHECK (resolver_status IN ('pending', 'resolving', 'matched', 'ambiguous', 'not_found', 'unavailable', 'retryable', 'budget_exhausted')),
  resolver_error_code TEXT,
  match_rule TEXT,
  tidal_id TEXT,
  query_hash CHAR(64),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, candidate_key),
  UNIQUE (run_id, sequence_no)
);

CREATE TABLE ems_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recording_mbid TEXT,
  isrc TEXT,
  tidal_id TEXT NOT NULL,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT,
  duration_ms INTEGER NOT NULL CHECK (duration_ms > 0),
  release_date DATE,
  status TEXT NOT NULL DEFAULT 'candidate' CHECK (status IN ('candidate', 'active', 'stale', 'inactive', 'rejected')),
  match_confidence REAL NOT NULL CHECK (match_confidence >= 0 AND match_confidence <= 1),
  catalog_priority REAL NOT NULL DEFAULT 0 CHECK (catalog_priority >= 0 AND catalog_priority <= 1),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ems_tracks_tidal_id_uq ON ems_tracks (tidal_id);
CREATE UNIQUE INDEX ems_tracks_recording_isrc_uq
  ON ems_tracks (recording_mbid, isrc)
  WHERE recording_mbid IS NOT NULL AND isrc IS NOT NULL;
CREATE INDEX ems_tracks_active_idx ON ems_tracks (status, updated_at DESC) WHERE status = 'active';

CREATE TABLE ems_track_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id UUID NOT NULL REFERENCES ems_tracks(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL CHECK (source_type IN ('musicbrainz', 'tidal', 'user_import')),
  source_id TEXT NOT NULL,
  source_version TEXT,
  source_license TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (source_type, source_id)
);

CREATE TABLE ems_availability_events (
  id BIGSERIAL PRIMARY KEY,
  track_id UUID NOT NULL REFERENCES ems_tracks(id) ON DELETE CASCADE,
  region CHAR(2) NOT NULL,
  capability TEXT NOT NULL,
  playable BOOLEAN NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  error_code TEXT
);
CREATE INDEX ems_availability_lookup_idx ON ems_availability_events (track_id, region, capability, observed_at DESC);

CREATE TABLE ems_track_embeddings (
  track_id UUID PRIMARY KEY REFERENCES ems_tracks(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  model_revision TEXT NOT NULL,
  input_hash CHAR(64) NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  embedding vector(768),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error_code TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((status = 'completed') = (embedding IS NOT NULL))
);

COMMIT;
