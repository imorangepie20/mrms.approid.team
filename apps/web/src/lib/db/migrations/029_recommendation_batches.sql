BEGIN;

CREATE TABLE user_recommendation_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('current', 'replaced', 'exhausted')),
  profile_version TEXT NOT NULL,
  ranking_version TEXT NOT NULL CHECK (ranking_version IN ('baseline', 'hybrid-v0')),
  recommendations JSONB NOT NULL,
  track_ids UUID[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  replaced_at TIMESTAMPTZ,
  UNIQUE (id, user_id),
  CHECK (jsonb_typeof(recommendations) = 'object'),
  CHECK (cardinality(track_ids) BETWEEN 0 AND 24),
  CHECK ((status = 'exhausted') = (cardinality(track_ids) = 0)),
  CHECK ((status = 'replaced') = (replaced_at IS NOT NULL))
);

CREATE UNIQUE INDEX user_recommendation_batches_one_active_idx
  ON user_recommendation_batches (user_id)
  WHERE status IN ('current', 'exhausted');

CREATE INDEX user_recommendation_batches_user_created_idx
  ON user_recommendation_batches (user_id, created_at DESC, id DESC);

CREATE TABLE user_recommendation_exposures (
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  track_id UUID NOT NULL,
  batch_id UUID NOT NULL,
  position SMALLINT NOT NULL CHECK (position BETWEEN 1 AND 24),
  ranking_version TEXT NOT NULL CHECK (ranking_version IN ('baseline', 'hybrid-v0')),
  recommended_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, track_id),
  UNIQUE (batch_id, position),
  FOREIGN KEY (batch_id, user_id)
    REFERENCES user_recommendation_batches(id, user_id) ON DELETE CASCADE
);

CREATE INDEX user_recommendation_exposures_user_recommended_idx
  ON user_recommendation_exposures (user_id, recommended_at DESC, batch_id);

COMMIT;
