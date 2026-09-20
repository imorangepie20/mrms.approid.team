BEGIN;

ALTER TABLE tidal_connections
  DROP COLUMN IF EXISTS tidal_user_id;

COMMIT;
