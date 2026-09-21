BEGIN;

CREATE TABLE user_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('track', 'playlist', 'album', 'artist')),
  source TEXT NOT NULL CHECK (source IN ('tidal', 'catalog')),
  source_id TEXT NOT NULL CHECK (char_length(source_id) BETWEEN 1 AND 300),
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  artwork_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, entity_type, source, source_id)
);

CREATE INDEX user_likes_user_created_idx
  ON user_likes (user_id, created_at DESC);

COMMIT;
