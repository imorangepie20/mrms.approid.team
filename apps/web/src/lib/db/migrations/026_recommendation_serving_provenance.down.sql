BEGIN;

ALTER TABLE user_recommendation_decisions
  DROP COLUMN IF EXISTS ranking_version;

ALTER TABLE user_recommendation_shadow_runs
  DROP COLUMN IF EXISTS serving_fallback_reason,
  DROP COLUMN IF EXISTS minimum_audio_coverage,
  DROP COLUMN IF EXISTS served_ranking_version,
  DROP COLUMN IF EXISTS requested_ranking_version;

COMMIT;
