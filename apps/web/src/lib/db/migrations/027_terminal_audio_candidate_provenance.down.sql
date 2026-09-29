BEGIN;

ALTER TABLE user_recommendation_shadow_runs
  DROP COLUMN IF EXISTS backfilled_track_ids,
  DROP COLUMN IF EXISTS audio_discarded_error_codes,
  DROP COLUMN IF EXISTS audio_discarded_track_ids,
  DROP COLUMN IF EXISTS served_baseline_track_ids;

COMMIT;
