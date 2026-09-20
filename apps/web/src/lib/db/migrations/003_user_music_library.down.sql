BEGIN;

DROP TABLE IF EXISTS musicbrainz_rate_limits;
DROP TABLE IF EXISTS musicbrainz_enrichment_jobs;
DROP TABLE IF EXISTS playlist_imports;
DROP TABLE IF EXISTS user_playlist_tracks;
DROP TABLE IF EXISTS music_tracks;
DROP TABLE IF EXISTS user_playlists;

COMMIT;
