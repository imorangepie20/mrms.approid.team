BEGIN;

ALTER TABLE user_recommendation_shadow_runs
  ADD COLUMN served_baseline_track_ids UUID[],
  ADD COLUMN audio_discarded_track_ids UUID[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN audio_discarded_error_codes TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN backfilled_track_ids UUID[] NOT NULL DEFAULT '{}'::uuid[];

UPDATE user_recommendation_shadow_runs
SET served_baseline_track_ids = baseline_track_ids;

ALTER TABLE user_recommendation_shadow_runs
  ALTER COLUMN served_baseline_track_ids SET NOT NULL,
  ADD CHECK (cardinality(served_baseline_track_ids) <= requested_limit),
  ADD CHECK (
    cardinality(audio_discarded_track_ids) = cardinality(audio_discarded_error_codes)
  ),
  ADD CHECK (cardinality(audio_discarded_track_ids) <= 120),
  ADD CHECK (cardinality(backfilled_track_ids) <= candidate_count);

COMMIT;
