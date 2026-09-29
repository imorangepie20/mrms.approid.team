BEGIN;

DROP FUNCTION IF EXISTS prune_recommendation_shadow_runs(UUID, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS recommendation_shadow_cleanup_candidates(UUID, INTEGER, INTEGER);

UPDATE user_recommendation_shadow_runs
SET serving_fallback_reason = 'audio_coverage_below_threshold'
WHERE serving_fallback_reason = 'component_coverage_incomplete';

ALTER TABLE user_recommendation_shadow_runs
  DROP CONSTRAINT IF EXISTS user_recommendation_shadow_runs_serving_fallback_reason_check;

ALTER TABLE user_recommendation_shadow_runs
  ADD CONSTRAINT user_recommendation_shadow_runs_serving_fallback_reason_check
  CHECK (serving_fallback_reason IN (
    'ranking_disabled',
    'subject_not_allowlisted',
    'coverage_threshold_unconfigured',
    'audio_profile_unavailable',
    'audio_coverage_below_threshold'
  ));

COMMIT;
