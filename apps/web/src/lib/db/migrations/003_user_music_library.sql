BEGIN;

CREATE TABLE user_playlists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  tidal_playlist_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  tidal_artwork_url TEXT,
  selected BOOLEAN NOT NULL DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, tidal_playlist_id)
);

CREATE TABLE music_tracks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  tidal_track_id TEXT NOT NULL,
  isrc TEXT,
  title TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  album_name TEXT NOT NULL,
  duration_ms INTEGER,
  tidal_album_id TEXT,
  tidal_artwork_url TEXT,
  mb_recording_id UUID,
  mb_release_id UUID,
  mb_release_group_id UUID,
  mb_status TEXT NOT NULL CHECK (
    mb_status IN ('pending', 'matched', 'not_found', 'ambiguous', 'failed', 'unavailable')
  ),
  cover_art_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, tidal_track_id)
);

CREATE TABLE user_playlist_tracks (
  playlist_id UUID NOT NULL REFERENCES user_playlists(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  track_id UUID NOT NULL REFERENCES music_tracks(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ,
  PRIMARY KEY (playlist_id, position)
);

CREATE TABLE playlist_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  requested_playlist_ids TEXT[] NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('pending', 'running', 'paused', 'completed', 'failed_retryable', 'failed')
  ),
  saved_playlist_count INTEGER NOT NULL DEFAULT 0 CHECK (saved_playlist_count >= 0),
  saved_track_count INTEGER NOT NULL DEFAULT 0 CHECK (saved_track_count >= 0),
  error_code TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE musicbrainz_enrichment_jobs (
  track_id UUID PRIMARY KEY REFERENCES music_tracks(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error_code TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE musicbrainz_rate_limits (
  service TEXT PRIMARY KEY,
  next_request_at TIMESTAMPTZ NOT NULL
);

INSERT INTO musicbrainz_rate_limits (service, next_request_at)
VALUES ('musicbrainz', '-infinity'::timestamptz);

COMMIT;
