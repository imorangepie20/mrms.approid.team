BEGIN;

ALTER TABLE ems_tracks DROP COLUMN IF EXISTS mb_tag_recording_mbid;

COMMIT;
