import type { ConnectionStatus } from "@/lib/auth/connection-status";
import { decryptToken, encryptToken } from "@/lib/auth/token-cipher";
import {
  readTidalOAuthConfig,
  refreshTidalToken,
  type TidalToken,
} from "@/lib/tidal/oauth";

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
  tidal_user_id: string | null;
  updated_at: Date;
};

export type UserConnection = {
  accessTokenExpiresAt: Date | null;
  auth0Subject: string;
  encryptedAccessToken: string | null;
  encryptedRefreshToken: string | null;
  scope: string | null;
  status: ConnectionStatus;
  tidalUserId: string | null;
  updatedAt: Date;
};

export type UpsertUserConnectionInput = {
  accessTokenExpiresAt?: Date | null;
  auth0Subject: string;
  encryptedAccessToken?: string | null;
  encryptedRefreshToken?: string | null;
  scope?: string | null;
  status: ConnectionStatus;
  tidalUserId?: string | null;
};

type UsableAccessTokenDependencies = {
  encryptionKey?: string;
  executor?: QueryExecutor;
  now?: () => Date;
  refresh?: (refreshToken: string) => Promise<TidalToken>;
};

type StoreDeviceTokenDependencies = {
  encryptionKey?: string;
  executor?: QueryExecutor;
  now?: () => Date;
};

const refreshesBySubject = new Map<string, Promise<unknown>>();

export type UsableTidalAccessToken = {
  accessToken: string;
  expiresAt: Date;
  scope: string | null;
  userId: string | null;
};

export async function storeTidalDeviceToken(
  auth0Subject: string,
  token: TidalToken,
  dependencies: StoreDeviceTokenDependencies = {},
) {
  const encryptionKey = dependencies.encryptionKey ?? process.env.TOKEN_ENCRYPTION_KEY;
  if (!encryptionKey) throw new Error("TOKEN_ENCRYPTION_KEY is required.");
  const now = dependencies.now?.() ?? new Date();
  return upsertUserConnection({
    accessTokenExpiresAt: new Date(now.getTime() + token.expiresIn * 1000),
    auth0Subject,
    encryptedAccessToken: encryptToken(token.accessToken, encryptionKey),
    encryptedRefreshToken: token.refreshToken
      ? encryptToken(token.refreshToken, encryptionKey)
      : null,
    scope: token.scope,
    status: "connected",
    tidalUserId: token.userId ?? null,
  }, dependencies.executor);
}

function database(executor?: QueryExecutor) {
  return executor ?? (getDatabasePool() as QueryExecutor);
}

async function inConnectionTransaction<T>(
  executor: QueryExecutor | undefined,
  work: (transaction: QueryExecutor) => Promise<T>,
) {
  if (executor) return work(executor);

  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function serializeRefresh<T>(key: string, work: () => Promise<T>) {
  const previous = refreshesBySubject.get(key) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(work);
  refreshesBySubject.set(key, current);
  try {
    return await current;
  } finally {
    if (refreshesBySubject.get(key) === current) {
      refreshesBySubject.delete(key);
    }
  }
}

function toUserConnection(row: ConnectionRow): UserConnection {
  return {
    accessTokenExpiresAt: row.access_token_expires_at,
    auth0Subject: row.auth0_subject,
    encryptedAccessToken: row.encrypted_access_token,
    encryptedRefreshToken: row.encrypted_refresh_token,
    scope: row.scope,
    status: row.status,
    tidalUserId: row.tidal_user_id,
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
       c.tidal_user_id,
       c.updated_at
     FROM app_users AS u
     INNER JOIN tidal_connections AS c ON c.user_id = u.id
     WHERE u.auth0_subject = $1`,
    [auth0Subject],
  );

  return result.rows[0] ? toUserConnection(result.rows[0]) : null;
}

async function getUserConnectionForUpdate(
  auth0Subject: string,
  executor: QueryExecutor,
) {
  const result = await executor.query<ConnectionRow>(
    `SELECT
       u.auth0_subject,
       c.status,
       c.encrypted_access_token,
       c.encrypted_refresh_token,
       c.access_token_expires_at,
       c.scope,
       c.tidal_user_id,
       c.updated_at
     FROM app_users AS u
     INNER JOIN tidal_connections AS c ON c.user_id = u.id
     WHERE u.auth0_subject = $1
     FOR UPDATE OF c`,
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
       scope,
       tidal_user_id
     )
     SELECT id, $2, $3, $4, $5, $6, $7 FROM target_user
     ON CONFLICT (user_id)
     DO UPDATE SET
       status = EXCLUDED.status,
       encrypted_access_token = EXCLUDED.encrypted_access_token,
       encrypted_refresh_token = EXCLUDED.encrypted_refresh_token,
       access_token_expires_at = EXCLUDED.access_token_expires_at,
       scope = EXCLUDED.scope,
       tidal_user_id = COALESCE(EXCLUDED.tidal_user_id, tidal_connections.tidal_user_id),
       updated_at = now()
     RETURNING
       (SELECT auth0_subject FROM target_user) AS auth0_subject,
       status,
       encrypted_access_token,
       encrypted_refresh_token,
       access_token_expires_at,
       scope,
       tidal_user_id,
       updated_at`,
    [
      input.auth0Subject,
      input.status,
      input.encryptedAccessToken ?? null,
      input.encryptedRefreshToken ?? null,
      input.accessTokenExpiresAt ?? null,
      input.scope ?? null,
      input.tidalUserId ?? null,
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

export async function getUsableTidalAccessToken(
  auth0Subject: string,
  dependencies: UsableAccessTokenDependencies = {},
): Promise<UsableTidalAccessToken> {
  const connection = await getUserConnection(auth0Subject, dependencies.executor);
  if (
    !connection ||
    connection.status !== "connected" ||
    !connection.encryptedAccessToken ||
    !connection.accessTokenExpiresAt
  ) {
    throw new Error("TIDAL connection is not usable.");
  }

  const encryptionKey =
    dependencies.encryptionKey ?? process.env.TOKEN_ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error("TOKEN_ENCRYPTION_KEY is required.");
  }

  const now = dependencies.now?.() ?? new Date();
  const refreshThreshold = now.getTime() + 60_000;
  if (connection.accessTokenExpiresAt.getTime() > refreshThreshold) {
    return {
      accessToken: decryptToken(connection.encryptedAccessToken, encryptionKey),
      expiresAt: connection.accessTokenExpiresAt,
      scope: connection.scope,
      userId: connection.tidalUserId,
    };
  }

  return serializeRefresh(auth0Subject, () =>
    inConnectionTransaction(dependencies.executor, async (transaction) => {
      const latest = await getUserConnectionForUpdate(auth0Subject, transaction);
      if (
        !latest ||
        latest.status !== "connected" ||
        !latest.encryptedAccessToken ||
        !latest.accessTokenExpiresAt
      ) {
        throw new Error("TIDAL connection is not usable.");
      }
      if (latest.accessTokenExpiresAt.getTime() > refreshThreshold) {
        return {
          accessToken: decryptToken(latest.encryptedAccessToken, encryptionKey),
          expiresAt: latest.accessTokenExpiresAt,
          scope: latest.scope,
          userId: latest.tidalUserId,
        };
      }
      if (!latest.encryptedRefreshToken) {
        throw new Error("TIDAL refresh token is unavailable.");
      }

      const storedRefreshToken = decryptToken(
        latest.encryptedRefreshToken,
        encryptionKey,
      );
      const refresh =
        dependencies.refresh ??
        ((token: string) => refreshTidalToken(token, readTidalOAuthConfig()));
      const refreshed = await refresh(storedRefreshToken);
      const expiresAt = new Date(now.getTime() + refreshed.expiresIn * 1000);
      const refreshToken = refreshed.refreshToken ?? storedRefreshToken;
      const scope = refreshed.scope ?? latest.scope;

      await upsertUserConnection(
        {
          accessTokenExpiresAt: expiresAt,
          auth0Subject,
          encryptedAccessToken: encryptToken(refreshed.accessToken, encryptionKey),
          encryptedRefreshToken: encryptToken(refreshToken, encryptionKey),
          scope,
          status: "connected",
          tidalUserId: refreshed.userId ?? latest.tidalUserId,
        },
        transaction,
      );

      return {
        accessToken: refreshed.accessToken,
        expiresAt,
        scope,
        userId: refreshed.userId ?? latest.tidalUserId,
      };
    }),
  );
}
