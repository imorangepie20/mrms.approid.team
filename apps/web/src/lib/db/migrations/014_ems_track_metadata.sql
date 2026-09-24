BEGIN;

ALTER TABLE ems_tracks
  ADD COLUMN mb_tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN mb_tag_votes JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN mb_tag_snapshot_id TEXT,
  ADD COLUMN mb_first_release_date DATE,
  ADD COLUMN tidal_album_release_date DATE;

COMMIT;
