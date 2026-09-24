BEGIN;

ALTER TABLE ems_tracks
  DROP COLUMN IF EXISTS tidal_album_release_date,
  DROP COLUMN IF EXISTS mb_first_release_date,
  DROP COLUMN IF EXISTS mb_tags,
  DROP COLUMN IF EXISTS mb_tag_votes,
  DROP COLUMN IF EXISTS mb_tag_snapshot_id;

COMMIT;
