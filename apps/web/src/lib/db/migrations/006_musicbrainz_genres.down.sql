BEGIN;

DROP TABLE IF EXISTS musicbrainz_artists;

ALTER TABLE music_tracks
  DROP COLUMN IF EXISTS mb_genres,
  DROP COLUMN IF EXISTS mb_tags;

COMMIT;
