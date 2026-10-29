-- 주의: baseline-v2 값이 기록된 행이 있으면 기존 CHECK를 복원할 때 실패한다. 의도된 동작이며,
-- 그 경우 해당 행을 먼저 정리한 뒤 다시 실행한다.
BEGIN;

DELETE FROM ems_source_routines WHERE source_key IN ('lastfm_artist_tags', 'music_attributes');
ALTER TABLE ems_source_routines DROP CONSTRAINT ems_source_routines_source_key_check;
ALTER TABLE ems_source_routines ADD CONSTRAINT ems_source_routines_source_key_check
  CHECK (source_key IN ('tidal_editorial', 'musicbrainz_core', 'musicbrainz_canonical',
                       'musicbrainz_metadata', 'melon_genres'));

ALTER TABLE user_recommendation_shadow_runs DROP CONSTRAINT user_recommendation_shadow_runs_served_ranking_version_check;
ALTER TABLE user_recommendation_shadow_runs ADD CONSTRAINT user_recommendation_shadow_runs_served_ranking_version_check
  CHECK (served_ranking_version IN ('baseline', 'hybrid-v0'));
ALTER TABLE user_recommendation_shadow_runs DROP CONSTRAINT user_recommendation_shadow_runs_requested_ranking_version_check;
ALTER TABLE user_recommendation_shadow_runs ADD CONSTRAINT user_recommendation_shadow_runs_requested_ranking_version_check
  CHECK (requested_ranking_version IN ('baseline', 'hybrid-v0'));
ALTER TABLE user_recommendation_decisions DROP CONSTRAINT user_recommendation_decisions_ranking_version_check;
ALTER TABLE user_recommendation_decisions ADD CONSTRAINT user_recommendation_decisions_ranking_version_check
  CHECK (ranking_version IN ('baseline', 'hybrid-v0'));
ALTER TABLE user_recommendation_exposures DROP CONSTRAINT user_recommendation_exposures_ranking_version_check;
ALTER TABLE user_recommendation_exposures ADD CONSTRAINT user_recommendation_exposures_ranking_version_check
  CHECK (ranking_version IN ('baseline', 'hybrid-v0'));
ALTER TABLE user_recommendation_batches DROP CONSTRAINT user_recommendation_batches_ranking_version_check;
ALTER TABLE user_recommendation_batches ADD CONSTRAINT user_recommendation_batches_ranking_version_check
  CHECK (ranking_version IN ('baseline', 'hybrid-v0'));

DROP TABLE IF EXISTS music_track_attributes;
DROP TABLE IF EXISTS ems_track_attributes;
DROP TABLE IF EXISTS music_artist_attributes;

COMMIT;
