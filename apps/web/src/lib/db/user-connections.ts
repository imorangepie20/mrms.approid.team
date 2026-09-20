import type { ConnectionStatus } from "@/lib/auth/connection-status";

import { getDatabasePool } from "./pool";

export type QueryExecutor = {
  query<Row extends Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Row[] }>;
};

type ConnectionRow = {
  access_token_expires_at: Date | null;
  auth0_subject: string;
  encrypted_access_token: string | null;
  encrypted_refresh_token: string | null;
  scope: string | null;
  status: ConnectionStatus;
  updated_at: Date;
};

export type UserConnection = {
  accessTokenExpiresAt: Date | null;
  auth0Subject: string;
  encryptedAccessToken: string | null;
  encryptedRefreshToken: string | null;
  scope: string | null;
  status: ConnectionStatus;
  updatedAt: Date;
};

export type UpsertUserConnectionInput = {
  accessTokenExpiresAt?: Date | null;
  auth0Subject: string;
  encryptedAccessToken?: string | null;
  encryptedRefreshToken?: string | null;
  scope?: string | null;
  status: ConnectionStatus;
};

function database(executor?: QueryExecutor) {
  return executor ?? (getDatabasePool() as QueryExecutor);
}

function toUserConnection(row: ConnectionRow): UserConnection {
  return {
    accessTokenExpiresAt: row.access_token_expires_at,
    auth0Subject: row.auth0_subject,
    encryptedAccessToken: row.encrypted_access_token,
    encryptedRefreshToken: row.encrypted_refresh_token,
    scope: row.scope,
    status: row.status,
    updatedAt: row.updated_at,
  };
}

export async function getUserConnection(
  auth0Subject: string,
  executor?: QueryExecutor,
) {
  const result = await database(executor).query<ConnectionRow>(
    `SELECT
       u.auth0_subject,
       c.status,
       c.encrypted_access_token,
       c.encrypted_refresh_token,
       c.access_token_expires_at,
       c.scope,
       c.updated_at
     FROM app_users AS u
     INNER JOIN tidal_connections AS c ON c.user_id = u.id
     WHERE u.auth0_subject = $1`,
    [auth0Subject],
  );

  return result.rows[0] ? toUserConnection(result.rows[0]) : null;
}

export async function upsertUserConnection(
  input: UpsertUserConnectionInput,
  executor?: QueryExecutor,
) {
  const result = await database(executor).query<ConnectionRow>(
    `WITH target_user AS (
       INSERT INTO app_users (auth0_subject)
       VALUES ($1)
       ON CONFLICT (auth0_subject)
       DO UPDATE SET auth0_subject = EXCLUDED.auth0_subject
       RETURNING id, auth0_subject
     )
     INSERT INTO tidal_connections (
       user_id,
       status,
       encrypted_access_token,
       encrypted_refresh_token,
       access_token_expires_at,
       scope
     )
     SELECT id, $2, $3, $4, $5, $6 FROM target_user
     ON CONFLICT (user_id)
     DO UPDATE SET
       status = EXCLUDED.status,
       encrypted_access_token = EXCLUDED.encrypted_access_token,
       encrypted_refresh_token = EXCLUDED.encrypted_refresh_token,
       access_token_expires_at = EXCLUDED.access_token_expires_at,
       scope = EXCLUDED.scope,
       updated_at = now()
     RETURNING
       (SELECT auth0_subject FROM target_user) AS auth0_subject,
       status,
       encrypted_access_token,
       encrypted_refresh_token,
       access_token_expires_at,
       scope,
       updated_at`,
    [
      input.auth0Subject,
      input.status,
      input.encryptedAccessToken ?? null,
      input.encryptedRefreshToken ?? null,
      input.accessTokenExpiresAt ?? null,
      input.scope ?? null,
    ],
  );

  return toUserConnection(result.rows[0]);
}

export async function markReauthenticationRequired(
  auth0Subject: string,
  executor?: QueryExecutor,
) {
  const result = await database(executor).query<{ auth0_subject: string }>(
    `UPDATE tidal_connections AS c
     SET status = 'reauthentication_required', updated_at = now()
     FROM app_users AS u
     WHERE u.auth0_subject = $1
       AND c.user_id = u.id
     RETURNING u.auth0_subject`,
    [auth0Subject],
  );

  return result.rows.length > 0;
}
