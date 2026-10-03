CREATE TABLE ems_editorial_refresh_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'ready', 'blocked', 'applied', 'failed', 'expired')),
  preview JSONB NOT NULL DEFAULT '{}'::jsonb,
  backup JSONB,
  error_code TEXT,
  created_by TEXT NOT NULL,
  applied_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  CHECK (status NOT IN ('ready', 'applied') OR (backup IS NOT NULL AND expires_at IS NOT NULL)),
  CHECK (status != 'applied' OR (applied_at IS NOT NULL AND applied_by IS NOT NULL))
);
CREATE UNIQUE INDEX ems_editorial_refresh_one_open
  ON ems_editorial_refresh_jobs ((true)) WHERE status IN ('pending', 'running', 'ready');
CREATE INDEX ems_editorial_refresh_recent
  ON ems_editorial_refresh_jobs (created_at DESC);
