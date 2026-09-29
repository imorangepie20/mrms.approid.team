BEGIN;

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
    'component_coverage_incomplete'
  ));

CREATE FUNCTION recommendation_shadow_cleanup_candidates(
  p_user_id UUID DEFAULT NULL,
  p_retention_days INTEGER DEFAULT 30,
  p_max_runs_per_user INTEGER DEFAULT 100
)
RETURNS TABLE (
  run_id UUID,
  user_id UUID,
  created_at TIMESTAMPTZ,
  cleanup_reason TEXT
)
LANGUAGE sql
STABLE
AS $$
  WITH ranked AS (
    SELECT
      shadow_run.id AS run_id,
      shadow_run.user_id,
      shadow_run.created_at,
      row_number() OVER (
        PARTITION BY user_id
        ORDER BY created_at DESC, id DESC
      ) AS user_run_number
    FROM user_recommendation_shadow_runs AS shadow_run
    WHERE p_user_id IS NULL OR shadow_run.user_id = p_user_id
  )
  SELECT
    ranked.run_id,
    ranked.user_id,
    ranked.created_at,
    CASE
      WHEN ranked.created_at < statement_timestamp()
        - make_interval(days => p_retention_days)
        THEN 'retention_expired'
      ELSE 'per_user_limit_exceeded'
    END AS cleanup_reason
  FROM ranked
  WHERE p_retention_days BETWEEN 1 AND 3650
    AND p_max_runs_per_user BETWEEN 1 AND 100000
    AND (
      ranked.created_at < statement_timestamp()
        - make_interval(days => p_retention_days)
      OR ranked.user_run_number > p_max_runs_per_user
    )
  ORDER BY ranked.user_id, ranked.created_at, ranked.run_id;
$$;

CREATE FUNCTION prune_recommendation_shadow_runs(
  p_user_id UUID DEFAULT NULL,
  p_retention_days INTEGER DEFAULT 30,
  p_max_runs_per_user INTEGER DEFAULT 100
)
RETURNS BIGINT
LANGUAGE sql
VOLATILE
AS $$
  WITH cleanup_candidates AS MATERIALIZED (
    SELECT run_id
    FROM recommendation_shadow_cleanup_candidates(
      p_user_id,
      p_retention_days,
      p_max_runs_per_user
    )
  ),
  deleted AS (
    DELETE FROM user_recommendation_shadow_runs AS shadow_run
    USING cleanup_candidates
    WHERE shadow_run.id = cleanup_candidates.run_id
    RETURNING shadow_run.id
  )
  SELECT count(*)::BIGINT FROM deleted;
$$;

COMMIT;
