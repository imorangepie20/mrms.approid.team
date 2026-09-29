BEGIN;

CREATE TABLE user_recommendation_history_hidden_tracks (
  batch_id UUID NOT NULL REFERENCES user_recommendation_batches(id) ON DELETE CASCADE,
  track_id UUID NOT NULL,
  hidden_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (batch_id, track_id)
);

COMMIT;
