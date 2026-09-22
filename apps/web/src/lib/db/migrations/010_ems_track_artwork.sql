BEGIN;

ALTER TABLE ems_tracks
  ADD COLUMN artwork_url TEXT;

COMMIT;
