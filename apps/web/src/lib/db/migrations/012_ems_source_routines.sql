CREATE TABLE ems_source_routines (
  source_key TEXT PRIMARY KEY CHECK (source_key IN ('tidal_editorial', 'musicbrainz_core', 'musicbrainz_canonical')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  check_interval_seconds INTEGER NOT NULL CHECK (check_interval_seconds >= 3600),
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('idle', 'checking', 'downloading', 'staging', 'queued', 'resolving', 'failed')),
  next_check_at TIMESTAMPTZ NOT NULL,
  last_checked_at TIMESTAMPTZ,
  last_version TEXT,
  last_success_at TIMESTAMPTZ,
  last_candidate_count INTEGER NOT NULL DEFAULT 0 CHECK (last_candidate_count >= 0),
  current_run_id UUID REFERENCES ems_ingest_runs(id) ON DELETE SET NULL,
  error_code TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX ems_musicbrainz_snapshot_version_uq
  ON ems_ingest_runs (snapshot_id)
  WHERE run_type = 'musicbrainz_snapshot' AND snapshot_id IS NOT NULL;

CREATE TABLE ems_editorial_source_playlists (
  playlist_id TEXT PRIMARY KEY,
  source_updated_at TEXT NOT NULL,
  last_fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_candidate_count INTEGER NOT NULL DEFAULT 0 CHECK (last_candidate_count >= 0)
);

INSERT INTO ems_source_routines (source_key, check_interval_seconds, next_check_at, last_version)
VALUES
  ('tidal_editorial', 86400, now() + interval '1 day', NULL),
  ('musicbrainz_core', 43200, now(), '20260919-002047'),
  ('musicbrainz_canonical', 86400, now(), '20260917-080002');
