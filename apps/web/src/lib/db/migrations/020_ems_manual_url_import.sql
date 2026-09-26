BEGIN;

CREATE TABLE ems_manual_url_import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL CHECK (source_type IN ('melon', 'tidal')),
  source_url TEXT NOT NULL CHECK (char_length(source_url) BETWEEN 1 AND 2048),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'extracting', 'review', 'processing', 'completed', 'failed')),
  phase TEXT NOT NULL DEFAULT 'queued',
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0),
  item_count INTEGER NOT NULL DEFAULT 0 CHECK (item_count BETWEEN 0 AND 100),
  error_code TEXT,
  created_by TEXT NOT NULL CHECK (char_length(created_by) BETWEEN 1 AND 255),
  collected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ems_manual_url_import_jobs_created_idx
  ON ems_manual_url_import_jobs (created_at DESC);
CREATE INDEX ems_manual_url_import_jobs_pending_idx
  ON ems_manual_url_import_jobs (created_at)
  WHERE status = 'pending';

CREATE TABLE ems_manual_url_import_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES ems_manual_url_import_jobs(id) ON DELETE CASCADE,
  sequence_no INTEGER NOT NULL CHECK (sequence_no BETWEEN 0 AND 99),
  source_id TEXT NOT NULL CHECK (char_length(source_id) BETWEEN 1 AND 255),
  source_item_url TEXT NOT NULL CHECK (char_length(source_item_url) BETWEEN 1 AND 2048),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 512),
  artist TEXT NOT NULL CHECK (char_length(artist) BETWEEN 1 AND 512),
  album TEXT CHECK (album IS NULL OR char_length(album) <= 512),
  duration_ms INTEGER CHECK (duration_ms IS NULL OR duration_ms > 0),
  artwork_url TEXT CHECK (artwork_url IS NULL OR char_length(artwork_url) <= 2048),
  release_date DATE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'review'
    CHECK (status IN ('review', 'approved', 'queued', 'rejected')),
  ingest_run_id UUID REFERENCES ems_ingest_runs(id) ON DELETE SET NULL,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, sequence_no),
  UNIQUE (job_id, source_id)
);

CREATE INDEX ems_manual_url_import_items_job_idx
  ON ems_manual_url_import_items (job_id, sequence_no);

COMMIT;
