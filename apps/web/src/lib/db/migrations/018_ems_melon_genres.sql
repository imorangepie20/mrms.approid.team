BEGIN;

ALTER TABLE ems_ingest_runs DROP CONSTRAINT ems_ingest_runs_run_type_check;
ALTER TABLE ems_ingest_runs ADD CONSTRAINT ems_ingest_runs_run_type_check
  CHECK (run_type IN ('musicbrainz_snapshot', 'tidal_resolve', 'user_import', 'melon_genres'));
ALTER TABLE ems_ingest_candidates DROP CONSTRAINT ems_ingest_candidates_selection_bucket_check;
ALTER TABLE ems_ingest_candidates ADD CONSTRAINT ems_ingest_candidates_selection_bucket_check
  CHECK (selection_bucket IN ('canonical', 'diversity', 'long_tail', 'user_import', 'melon'));
ALTER TABLE ems_track_sources DROP CONSTRAINT ems_track_sources_source_type_check;
ALTER TABLE ems_track_sources ADD CONSTRAINT ems_track_sources_source_type_check
  CHECK (source_type IN ('musicbrainz', 'tidal', 'user_import', 'melon'));

CREATE TABLE ems_melon_tracks (
  song_id TEXT PRIMARY KEY CHECK (song_id ~ '^[0-9]+$'),
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  album TEXT,
  source_url TEXT NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ems_melon_track_genres (
  song_id TEXT NOT NULL REFERENCES ems_melon_tracks(song_id) ON DELETE CASCADE,
  genre_code TEXT NOT NULL CHECK (genre_code ~ '^GN0[1-8]00$'),
  genre_name TEXT NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (song_id, genre_code)
);
CREATE INDEX ems_melon_track_genres_code_idx ON ems_melon_track_genres (genre_code);

CREATE TABLE ems_melon_jobs (
  id UUID PRIMARY KEY REFERENCES ems_ingest_runs(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed')),
  phase TEXT NOT NULL DEFAULT 'queued',
  genre_codes JSONB,
  genre_index INTEGER NOT NULL DEFAULT 0 CHECK (genre_index >= 0),
  next_start_index INTEGER NOT NULL DEFAULT 1 CHECK (next_start_index >= 1),
  last_page_first_song_id TEXT,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  last_melon_request_at TIMESTAMPTZ,
  next_tidal_retry_at TIMESTAMPTZ,
  discovered_count INTEGER NOT NULL DEFAULT 0 CHECK (discovered_count >= 0),
  staged_count INTEGER NOT NULL DEFAULT 0 CHECK (staged_count >= 0),
  error_code TEXT,
  heartbeat_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX ems_melon_one_open_job ON ems_melon_jobs ((true))
  WHERE status IN ('pending', 'running', 'paused');

ALTER TABLE ems_source_routines DROP CONSTRAINT ems_source_routines_source_key_check;
ALTER TABLE ems_source_routines ADD CONSTRAINT ems_source_routines_source_key_check
  CHECK (source_key IN ('tidal_editorial', 'musicbrainz_core', 'musicbrainz_canonical',
                       'musicbrainz_metadata', 'melon_genres'));
INSERT INTO ems_source_routines (source_key, check_interval_seconds, next_check_at)
VALUES ('melon_genres', 86400, now() + interval '1 day');

COMMIT;
