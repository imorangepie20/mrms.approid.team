BEGIN;

ALTER TABLE user_recommendation_shadow_runs
  ADD COLUMN requested_ranking_version TEXT NOT NULL DEFAULT 'baseline'
    CHECK (requested_ranking_version IN ('baseline', 'hybrid-v0')),
  ADD COLUMN served_ranking_version TEXT NOT NULL DEFAULT 'baseline'
    CHECK (served_ranking_version IN ('baseline', 'hybrid-v0')),
  ADD COLUMN minimum_audio_coverage DOUBLE PRECISION
    CHECK (minimum_audio_coverage > 0 AND minimum_audio_coverage <= 1),
  ADD COLUMN serving_fallback_reason TEXT
    CHECK (serving_fallback_reason IN (
      'ranking_disabled',
      'subject_not_allowlisted',
      'coverage_threshold_unconfigured',
      'audio_profile_unavailable',
      'audio_coverage_below_threshold'
    ));

ALTER TABLE user_recommendation_decisions
  ADD COLUMN ranking_version TEXT NOT NULL DEFAULT 'baseline'
    CHECK (ranking_version IN ('baseline', 'hybrid-v0'));

COMMIT;
