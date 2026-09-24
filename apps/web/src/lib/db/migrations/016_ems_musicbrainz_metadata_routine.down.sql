BEGIN;

DELETE FROM ems_source_routines WHERE source_key = 'musicbrainz_metadata';
ALTER TABLE ems_source_routines DROP CONSTRAINT ems_source_routines_source_key_check;
ALTER TABLE ems_source_routines ADD CONSTRAINT ems_source_routines_source_key_check
  CHECK (source_key IN ('tidal_editorial', 'musicbrainz_core', 'musicbrainz_canonical'));

ALTER TABLE ems_tracks DROP COLUMN mb_metadata_snapshot_id;

COMMIT;
