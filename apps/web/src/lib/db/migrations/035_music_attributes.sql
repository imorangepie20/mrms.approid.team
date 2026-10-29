BEGIN;

-- 아티스트 단위 공유 속성. 사용자 식별 정보는 두지 않고 아티스트명과 태그만 저장한다.
CREATE TABLE music_artist_attributes (
  artist_key TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  mb_artist_mbid UUID,
  mb_tags JSONB NOT NULL DEFAULT '[]',
  mb_language TEXT,
  mb_snapshot_id TEXT,
  lastfm_tags JSONB NOT NULL DEFAULT '[]',
  lastfm_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (lastfm_status IN ('pending', 'ok', 'not_found', 'failed')),
  lastfm_error_code TEXT,
  lastfm_fetched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ems_track_attributes (
  track_id UUID PRIMARY KEY REFERENCES ems_tracks(id) ON DELETE CASCADE,
  artist_key TEXT NOT NULL,
  mb_snapshot_id TEXT,
  mb_recording_mbid UUID,
  mb_release_language TEXT,
  mb_tags JSONB NOT NULL DEFAULT '[]',
  language TEXT NOT NULL DEFAULT 'unknown',
  language_source TEXT NOT NULL DEFAULT 'none'
    CHECK (language_source IN ('musicbrainz_release', 'musicbrainz_artist', 'lastfm_tag', 'script', 'none')),
  genre_buckets JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(genre_buckets) = 'object'),
  genre_source TEXT NOT NULL DEFAULT 'none'
    CHECK (genre_source IN ('melon', 'musicbrainz_recording', 'artist', 'none')),
  taxonomy_version TEXT,
  resolved_at TIMESTAMPTZ
);
CREATE INDEX ems_track_attributes_artist_key_idx ON ems_track_attributes (artist_key);

CREATE TABLE music_track_attributes (
  track_id UUID PRIMARY KEY REFERENCES music_tracks(id) ON DELETE CASCADE,
  artist_key TEXT NOT NULL,
  mb_snapshot_id TEXT,
  mb_recording_mbid UUID,
  mb_release_language TEXT,
  mb_tags JSONB NOT NULL DEFAULT '[]',
  language TEXT NOT NULL DEFAULT 'unknown',
  language_source TEXT NOT NULL DEFAULT 'none'
    CHECK (language_source IN ('musicbrainz_release', 'musicbrainz_artist', 'lastfm_tag', 'script', 'none')),
  genre_buckets JSONB NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(genre_buckets) = 'object'),
  genre_source TEXT NOT NULL DEFAULT 'none'
    CHECK (genre_source IN ('melon', 'musicbrainz_recording', 'artist', 'none')),
  taxonomy_version TEXT,
  resolved_at TIMESTAMPTZ
);
CREATE INDEX music_track_attributes_artist_key_idx ON music_track_attributes (artist_key);

ALTER TABLE user_recommendation_batches DROP CONSTRAINT user_recommendation_batches_ranking_version_check;
ALTER TABLE user_recommendation_batches ADD CONSTRAINT user_recommendation_batches_ranking_version_check
  CHECK (ranking_version IN ('baseline', 'hybrid-v0', 'baseline-v2'));
ALTER TABLE user_recommendation_exposures DROP CONSTRAINT user_recommendation_exposures_ranking_version_check;
ALTER TABLE user_recommendation_exposures ADD CONSTRAINT user_recommendation_exposures_ranking_version_check
  CHECK (ranking_version IN ('baseline', 'hybrid-v0', 'baseline-v2'));
ALTER TABLE user_recommendation_decisions DROP CONSTRAINT user_recommendation_decisions_ranking_version_check;
ALTER TABLE user_recommendation_decisions ADD CONSTRAINT user_recommendation_decisions_ranking_version_check
  CHECK (ranking_version IN ('baseline', 'hybrid-v0', 'baseline-v2'));
ALTER TABLE user_recommendation_shadow_runs DROP CONSTRAINT user_recommendation_shadow_runs_requested_ranking_version_check;
ALTER TABLE user_recommendation_shadow_runs ADD CONSTRAINT user_recommendation_shadow_runs_requested_ranking_version_check
  CHECK (requested_ranking_version IN ('baseline', 'hybrid-v0', 'baseline-v2'));
ALTER TABLE user_recommendation_shadow_runs DROP CONSTRAINT user_recommendation_shadow_runs_served_ranking_version_check;
ALTER TABLE user_recommendation_shadow_runs ADD CONSTRAINT user_recommendation_shadow_runs_served_ranking_version_check
  CHECK (served_ranking_version IN ('baseline', 'hybrid-v0', 'baseline-v2'));

ALTER TABLE user_recommendation_shadow_runs
  DROP CONSTRAINT IF EXISTS user_recommendation_shadow_runs_serving_fallback_reason_check;
ALTER TABLE user_recommendation_shadow_runs
  ADD CONSTRAINT user_recommendation_shadow_runs_serving_fallback_reason_check
  CHECK (serving_fallback_reason IN (
    'ranking_disabled',
    'subject_not_allowlisted',
    'coverage_threshold_unconfigured',
    'audio_profile_unavailable',
    'audio_coverage_below_threshold',
    'component_coverage_incomplete',
    'attribute_profile_unavailable'
  ));

ALTER TABLE ems_source_routines DROP CONSTRAINT ems_source_routines_source_key_check;
ALTER TABLE ems_source_routines ADD CONSTRAINT ems_source_routines_source_key_check
  CHECK (source_key IN ('tidal_editorial', 'musicbrainz_core', 'musicbrainz_canonical',
                       'musicbrainz_metadata', 'melon_genres', 'lastfm_artist_tags', 'music_attributes'));
INSERT INTO ems_source_routines (source_key, check_interval_seconds, next_check_at)
VALUES ('lastfm_artist_tags', 3600, now()), ('music_attributes', 21600, now());

COMMIT;
