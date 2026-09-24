BEGIN;

ALTER TABLE ems_tracks ADD COLUMN mb_tag_recording_mbid TEXT;

COMMIT;
