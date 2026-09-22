BEGIN;

ALTER TABLE ems_tracks
  DROP COLUMN artwork_url;

COMMIT;
