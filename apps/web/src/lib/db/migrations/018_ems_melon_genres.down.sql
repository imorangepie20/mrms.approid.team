BEGIN;

DELETE FROM ems_source_routines WHERE source_key = 'melon_genres';
DELETE FROM ems_track_sources WHERE source_type = 'melon';
DELETE FROM ems_ingest_runs WHERE run_type = 'melon_genres';
DROP TABLE ems_melon_jobs;
DROP TABLE ems_melon_track_genres;
DROP TABLE ems_melon_tracks;

ALTER TABLE ems_source_routines DROP CONSTRAINT ems_source_routines_source_key_check;
ALTER TABLE ems_source_routines ADD CONSTRAINT ems_source_routines_source_key_check
  CHECK (source_key IN ('tidal_editorial', 'musicbrainz_core', 'musicbrainz_canonical',
                       'musicbrainz_metadata'));

ALTER TABLE ems_ingest_runs DROP CONSTRAINT ems_ingest_runs_run_type_check;
ALTER TABLE ems_ingest_runs ADD CONSTRAINT ems_ingest_runs_run_type_check
  CHECK (run_type IN ('musicbrainz_snapshot', 'tidal_resolve', 'user_import'));
ALTER TABLE ems_ingest_candidates DROP CONSTRAINT ems_ingest_candidates_selection_bucket_check;
ALTER TABLE ems_ingest_candidates ADD CONSTRAINT ems_ingest_candidates_selection_bucket_check
  CHECK (selection_bucket IN ('canonical', 'diversity', 'long_tail', 'user_import'));
ALTER TABLE ems_track_sources DROP CONSTRAINT ems_track_sources_source_type_check;
ALTER TABLE ems_track_sources ADD CONSTRAINT ems_track_sources_source_type_check
  CHECK (source_type IN ('musicbrainz', 'tidal', 'user_import'));

COMMIT;
