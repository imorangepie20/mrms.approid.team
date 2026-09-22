BEGIN;

DROP INDEX IF EXISTS user_recommendation_decisions_lookup_idx;
DROP TABLE IF EXISTS user_recommendation_decisions;
DROP TABLE IF EXISTS ems_track_embeddings;
DROP TABLE IF EXISTS ems_availability_events;
DROP TABLE IF EXISTS ems_track_sources;
DROP INDEX IF EXISTS ems_tracks_active_idx;
DROP INDEX IF EXISTS ems_tracks_recording_isrc_uq;
DROP INDEX IF EXISTS ems_tracks_tidal_id_uq;
DROP TABLE IF EXISTS ems_tracks;
DROP TABLE IF EXISTS ems_ingest_candidates;
DROP TABLE IF EXISTS ems_ingest_runs;

COMMIT;
