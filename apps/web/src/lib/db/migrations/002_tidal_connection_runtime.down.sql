BEGIN;

ALTER TABLE tidal_connections
  DROP COLUMN IF EXISTS disconnected_at;

COMMIT;
