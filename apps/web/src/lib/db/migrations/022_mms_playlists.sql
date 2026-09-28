BEGIN;

CREATE TABLE mms_playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  description TEXT CHECK (description IS NULL OR char_length(description) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX mms_playlists_user_updated_idx
  ON mms_playlists (user_id, updated_at DESC, id DESC);

CREATE TABLE mms_playlist_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  playlist_id UUID NOT NULL REFERENCES mms_playlists(id) ON DELETE CASCADE,
  track_key TEXT NOT NULL CHECK (char_length(track_key) BETWEEN 1 AND 308),
  source TEXT NOT NULL CHECK (source IN ('tidal', 'catalog')),
  source_id TEXT NOT NULL CHECK (char_length(source_id) BETWEEN 1 AND 300),
  tidal_track_id TEXT CHECK (tidal_track_id IS NULL OR char_length(tidal_track_id) BETWEEN 1 AND 300),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 300),
  artist TEXT NOT NULL CHECK (char_length(artist) BETWEEN 1 AND 300),
  album TEXT NOT NULL CHECK (char_length(album) BETWEEN 1 AND 300),
  artwork_url TEXT CHECK (artwork_url IS NULL OR char_length(artwork_url) <= 2000),
  duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds BETWEEN 0 AND 86400),
  playback_available BOOLEAN NOT NULL DEFAULT true,
  position INTEGER NOT NULL CHECK (position >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (playlist_id, track_key),
  CONSTRAINT mms_playlist_tracks_position_unique
    UNIQUE (playlist_id, position) DEFERRABLE INITIALLY IMMEDIATE
);

CREATE INDEX mms_playlist_tracks_playlist_position_idx
  ON mms_playlist_tracks (playlist_id, position);

COMMIT;
