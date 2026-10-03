BEGIN;

CREATE TABLE user_recommendation_history_hidden_batches (
  batch_id UUID PRIMARY KEY REFERENCES user_recommendation_batches(id) ON DELETE CASCADE,
  hidden_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
