BEGIN;

CREATE TABLE ems_spotify_chart_runs (
  run_id UUID PRIMARY KEY REFERENCES ems_ingest_runs(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed')),
  phase TEXT NOT NULL DEFAULT 'queued',
  source_section_url TEXT NOT NULL DEFAULT 'https://open.spotify.com/section/0JQ5DAzQHECxDlYNI6xD1g',
  spotify_request_budget INTEGER NOT NULL DEFAULT 4 CHECK (spotify_request_budget = 4),
  spotify_request_count INTEGER NOT NULL DEFAULT 0
    CHECK (spotify_request_count BETWEEN 0 AND spotify_request_budget),
  tidal_request_count INTEGER NOT NULL DEFAULT 0 CHECK (tidal_request_count BETWEEN 0 AND 450),
  active BOOLEAN NOT NULL DEFAULT false,
  error_code TEXT,
  created_by TEXT NOT NULL CHECK (char_length(created_by) BETWEEN 1 AND 255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX ems_spotify_chart_one_open_run
  ON ems_spotify_chart_runs ((true))
  WHERE status IN ('pending', 'running', 'paused');
CREATE UNIQUE INDEX ems_spotify_chart_one_active_run
  ON ems_spotify_chart_runs ((true))
  WHERE active;

CREATE TABLE ems_spotify_chart_playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES ems_spotify_chart_runs(run_id) ON DELETE CASCADE,
  spotify_id TEXT NOT NULL CHECK (spotify_id ~ '^[A-Za-z0-9]{22}$'),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 255),
  description TEXT NOT NULL DEFAULT '' CHECK (char_length(description) <= 1024),
  artwork_url TEXT CHECK (artwork_url IS NULL OR char_length(artwork_url) <= 2048),
  source_url TEXT NOT NULL CHECK (char_length(source_url) <= 2048),
  display_order INTEGER NOT NULL CHECK (display_order BETWEEN 0 AND 3),
  source_track_count INTEGER NOT NULL CHECK (source_track_count BETWEEN 0 AND 50),
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (run_id, spotify_id),
  UNIQUE (run_id, display_order)
);

CREATE TABLE ems_spotify_chart_items (
  playlist_id UUID NOT NULL REFERENCES ems_spotify_chart_playlists(id) ON DELETE CASCADE,
  sequence_no INTEGER NOT NULL CHECK (sequence_no BETWEEN 0 AND 49),
  spotify_track_id TEXT NOT NULL CHECK (spotify_track_id ~ '^[A-Za-z0-9]{22}$'),
  candidate_key TEXT NOT NULL CHECK (candidate_key ~ '^spotify:[A-Za-z0-9]{22}$'),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 512),
  artist TEXT NOT NULL CHECK (char_length(artist) BETWEEN 1 AND 512),
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms > 0),
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (playlist_id, sequence_no),
  UNIQUE (playlist_id, spotify_track_id)
);

CREATE INDEX ems_spotify_chart_playlists_run_order
  ON ems_spotify_chart_playlists (run_id, display_order);
CREATE INDEX ems_spotify_chart_items_candidate
  ON ems_spotify_chart_items (candidate_key, playlist_id, sequence_no);

COMMIT;
