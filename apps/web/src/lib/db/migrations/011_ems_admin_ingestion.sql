CREATE TABLE ems_admin_ingest_jobs (
  id UUID PRIMARY KEY REFERENCES ems_ingest_runs(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed')),
  phase TEXT NOT NULL DEFAULT 'queued',
  starting_active_count INTEGER NOT NULL CHECK (starting_active_count >= 0),
  active_track_count INTEGER NOT NULL CHECK (active_track_count >= 0),
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  playlists JSONB,
  next_playlist_index INTEGER NOT NULL DEFAULT 0 CHECK (next_playlist_index >= 0),
  error_code TEXT,
  next_retry_at TIMESTAMPTZ,
  heartbeat_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX ems_admin_ingest_one_open_job
  ON ems_admin_ingest_jobs ((true))
  WHERE status IN ('pending', 'running', 'paused');

CREATE TABLE ems_admin_ingest_samples (
  id BIGSERIAL PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES ems_admin_ingest_jobs(id) ON DELETE CASCADE,
  sampled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  active_track_count INTEGER NOT NULL CHECK (active_track_count >= 0),
  candidate_count INTEGER NOT NULL CHECK (candidate_count >= 0),
  matched_count INTEGER NOT NULL CHECK (matched_count >= 0)
);

CREATE INDEX ems_admin_ingest_samples_job_time
  ON ems_admin_ingest_samples (job_id, sampled_at, id);
