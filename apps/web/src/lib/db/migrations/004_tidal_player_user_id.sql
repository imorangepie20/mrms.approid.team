BEGIN;

ALTER TABLE tidal_connections
  ADD COLUMN IF NOT EXISTS tidal_user_id TEXT;

COMMIT;
