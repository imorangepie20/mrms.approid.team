BEGIN;

CREATE TABLE user_recommendation_shadow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  text_profile_id UUID NOT NULL REFERENCES user_taste_profiles(id) ON DELETE CASCADE,
  text_profile_version TEXT NOT NULL,
  audio_profile_id UUID REFERENCES user_audio_taste_profiles(id) ON DELETE CASCADE,
  audio_profile_version UUID,
  audio_model_revision TEXT,
  ranking_version TEXT NOT NULL CHECK (ranking_version = 'hybrid-v0'),
  requested_limit SMALLINT NOT NULL CHECK (requested_limit BETWEEN 1 AND 24),
  candidate_count SMALLINT NOT NULL CHECK (candidate_count BETWEEN 1 AND 120),
  baseline_track_ids UUID[] NOT NULL,
  hybrid_track_ids UUID[] NOT NULL,
  overlap_at_k DOUBLE PRECISION NOT NULL CHECK (overlap_at_k BETWEEN 0 AND 1),
  mean_abs_rank_displacement DOUBLE PRECISION NOT NULL CHECK (mean_abs_rank_displacement >= 0),
  same_artist_ratio DOUBLE PRECISION NOT NULL CHECK (same_artist_ratio BETWEEN 0 AND 1),
  selector_changed_count SMALLINT NOT NULL CHECK (selector_changed_count >= 0),
  audio_coverage_ratio DOUBLE PRECISION NOT NULL CHECK (audio_coverage_ratio BETWEEN 0 AND 1),
  mood_coverage_ratio DOUBLE PRECISION NOT NULL CHECK (mood_coverage_ratio BETWEEN 0 AND 1),
  rhythm_coverage_ratio DOUBLE PRECISION NOT NULL CHECK (rhythm_coverage_ratio BETWEEN 0 AND 1),
  fallback_used BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (cardinality(baseline_track_ids) <= requested_limit),
  CHECK (cardinality(hybrid_track_ids) <= requested_limit),
  CHECK ((audio_profile_id IS NULL) = (audio_profile_version IS NULL)),
  CHECK ((audio_profile_id IS NULL) = (audio_model_revision IS NULL))
);

CREATE INDEX user_recommendation_shadow_runs_user_created_idx
  ON user_recommendation_shadow_runs (user_id, created_at DESC);

CREATE TABLE user_recommendation_shadow_candidates (
  run_id UUID NOT NULL REFERENCES user_recommendation_shadow_runs(id) ON DELETE CASCADE,
  track_id UUID NOT NULL REFERENCES ems_tracks(id) ON DELETE CASCADE,
  baseline_rank SMALLINT NOT NULL CHECK (baseline_rank BETWEEN 1 AND 120),
  hybrid_base_rank SMALLINT NOT NULL CHECK (hybrid_base_rank BETWEEN 1 AND 120),
  hybrid_selected_rank SMALLINT NOT NULL CHECK (hybrid_selected_rank BETWEEN 1 AND 120),
  baseline_score DOUBLE PRECISION NOT NULL CHECK (baseline_score BETWEEN 0 AND 1),
  hybrid_score DOUBLE PRECISION NOT NULL CHECK (hybrid_score BETWEEN 0 AND 1),
  selector_score DOUBLE PRECISION NOT NULL CHECK (selector_score BETWEEN 0 AND 1),
  selector_changed BOOLEAN NOT NULL,
  audio_available BOOLEAN NOT NULL,
  mood_available BOOLEAN NOT NULL,
  rhythm_available BOOLEAN NOT NULL,
  fallback_used BOOLEAN NOT NULL,
  components JSONB NOT NULL,
  reason_codes JSONB NOT NULL,
  PRIMARY KEY (run_id, track_id)
);

COMMIT;
