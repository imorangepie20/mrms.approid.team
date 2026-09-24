BEGIN;

ALTER TABLE ems_tracks ADD COLUMN mb_metadata_snapshot_id TEXT;

ALTER TABLE ems_source_routines DROP CONSTRAINT ems_source_routines_source_key_check;
ALTER TABLE ems_source_routines ADD CONSTRAINT ems_source_routines_source_key_check
  CHECK (source_key IN ('tidal_editorial', 'musicbrainz_core', 'musicbrainz_canonical', 'musicbrainz_metadata'));

INSERT INTO ems_source_routines (source_key, check_interval_seconds, next_check_at)
VALUES ('musicbrainz_metadata', 21600, now());

COMMIT;
