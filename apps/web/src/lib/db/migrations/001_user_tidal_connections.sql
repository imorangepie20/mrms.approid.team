BEGIN;

CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth0_subject TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tidal_connections (
  user_id UUID PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (
    status IN (
      'not_connected',
      'authorization_pending',
      'connected',
      'reauthentication_required',
      'disconnected'
    )
  ),
  encrypted_access_token TEXT,
  encrypted_refresh_token TEXT,
  access_token_expires_at TIMESTAMPTZ,
  scope TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMIT;
