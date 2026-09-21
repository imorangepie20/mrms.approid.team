BEGIN;

ALTER TABLE music_tracks
  ADD COLUMN mb_genres TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN mb_tags TEXT[] NOT NULL DEFAULT '{}';

CREATE TABLE musicbrainz_artists (
  mbid UUID PRIMARY KEY,
  name TEXT NOT NULL,
  genres TEXT[] NOT NULL DEFAULT '{}',
  tags TEXT[] NOT NULL DEFAULT '{}',
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
