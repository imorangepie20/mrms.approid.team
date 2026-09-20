import { describe, expect, it, vi } from "vitest";

import { decryptToken, encryptToken } from "@/lib/auth/token-cipher";

import {
  getUsableTidalAccessToken,
  getUserConnection,
  markReauthenticationRequired,
  storeTidalDeviceToken,
  upsertUserConnection,
  type QueryExecutor,
} from "./user-connections";

function queryExecutor(rows: unknown[] = []) {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
  } satisfies QueryExecutor;
}

describe("user TIDAL connections", () => {
  it("encrypts and stores a device token with its granted scopes", async () => {
    const encryptionKey = Buffer.alloc(32, 13).toString("base64");
    const database = queryExecutor([{
      access_token_expires_at: new Date("2026-09-21T01:00:00.000Z"),
      auth0_subject: "auth0|listener-a",
      encrypted_access_token: "encrypted-access",
      encrypted_refresh_token: "encrypted-refresh",
      scope: "r_usr r_stream",
      status: "connected",
      tidal_user_id: "123",
      updated_at: new Date("2026-09-21T00:00:00.000Z"),
    }]);

    await storeTidalDeviceToken("auth0|listener-a", {
      accessToken: "device-access",
      expiresIn: 3600,
      refreshToken: "device-refresh",
      scope: "r_usr r_stream",
      userId: "123",
    }, {
      encryptionKey,
      executor: database,
      now: () => new Date("2026-09-21T00:00:00.000Z"),
    });

    const values = database.query.mock.calls[0]?.[1] as unknown[];
    expect(decryptToken(values[2] as string, encryptionKey)).toBe("device-access");
    expect(decryptToken(values[3] as string, encryptionKey)).toBe("device-refresh");
    expect(values[5]).toBe("r_usr r_stream");
    expect(values[6]).toBe("123");
  });

  it("queries a connection only by the requesting Auth0 subject", async () => {
    const database = queryExecutor();

    await expect(getUserConnection("auth0|listener-b", database)).resolves.toBeNull();

    expect(database.query).toHaveBeenCalledWith(
      expect.stringMatching(/WHERE\s+u\.auth0_subject\s*=\s*\$1/i),
      ["auth0|listener-b"],
    );
  });

  it("upserts token metadata for exactly one Auth0 subject", async () => {
    const database = queryExecutor([
      {
        access_token_expires_at: null,
        auth0_subject: "auth0|listener-a",
        encrypted_access_token: "encrypted-access",
        encrypted_refresh_token: null,
        scope: "playlists.read",
        status: "connected",
        updated_at: new Date("2026-09-20T00:00:00.000Z"),
      },
    ]);

    const result = await upsertUserConnection(
      {
        auth0Subject: "auth0|listener-a",
        encryptedAccessToken: "encrypted-access",
        scope: "playlists.read",
        status: "connected",
        tidalUserId: "12345",
      },
      database,
    );

    expect(result.auth0Subject).toBe("auth0|listener-a");
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining("ON CONFLICT (user_id)"),
      expect.arrayContaining([
        "auth0|listener-a",
        "connected",
        "encrypted-access",
        "12345",
      ]),
    );
  });

  it("marks reauthentication by Auth0 subject without returning token values", async () => {
    const database = queryExecutor([{ auth0_subject: "auth0|listener-a" }]);

    await expect(
      markReauthenticationRequired("auth0|listener-a", database),
    ).resolves.toBe(true);

    expect(database.query).toHaveBeenCalledWith(
      expect.stringMatching(/WHERE\s+u\.auth0_subject\s*=\s*\$1/i),
      ["auth0|listener-a"],
    );
  });

  it("returns the decrypted access token while it is valid beyond the refresh window", async () => {
    const encryptionKey = Buffer.alloc(32, 7).toString("base64");
    const database = queryExecutor([
      {
        access_token_expires_at: new Date("2026-09-20T01:02:00.000Z"),
        auth0_subject: "auth0|listener-a",
        encrypted_access_token: encryptToken("current-access", encryptionKey),
        encrypted_refresh_token: encryptToken("current-refresh", encryptionKey),
        scope: "playlists.read",
        status: "connected",
        tidal_user_id: "12345",
        updated_at: new Date("2026-09-20T00:00:00.000Z"),
      },
    ]);
    const refresh = vi.fn();

    const token = await getUsableTidalAccessToken("auth0|listener-a", {
      encryptionKey,
      executor: database,
      now: () => new Date("2026-09-20T01:00:00.000Z"),
      refresh,
    });

    expect(token).toEqual({
      accessToken: "current-access",
      expiresAt: new Date("2026-09-20T01:02:00.000Z"),
      scope: "playlists.read",
      userId: "12345",
    });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refreshes an expiring token and persists rotated encrypted credentials", async () => {
    const encryptionKey = Buffer.alloc(32, 9).toString("base64");
    const initialRow = {
      access_token_expires_at: new Date("2026-09-20T01:00:30.000Z"),
      auth0_subject: "auth0|listener-a",
      encrypted_access_token: encryptToken("old-access", encryptionKey),
      encrypted_refresh_token: encryptToken("old-refresh", encryptionKey),
      scope: "playlists.read",
      status: "connected",
      tidal_user_id: "12345",
      updated_at: new Date("2026-09-20T00:00:00.000Z"),
    };
    const updatedRow = {
      ...initialRow,
      access_token_expires_at: new Date("2026-09-20T03:00:00.000Z"),
      scope: "playlists.read search.read playback user.read",
    };
    const database = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [initialRow] })
        .mockResolvedValueOnce({ rows: [initialRow] })
        .mockResolvedValueOnce({ rows: [updatedRow] }),
    } satisfies QueryExecutor;
    const refresh = vi.fn().mockResolvedValue({
      accessToken: "new-access",
      expiresIn: 7200,
      refreshToken: "new-refresh",
      scope: "playlists.read search.read playback user.read",
    });

    const token = await getUsableTidalAccessToken("auth0|listener-a", {
      encryptionKey,
      executor: database,
      now: () => new Date("2026-09-20T01:00:00.000Z"),
      refresh,
    });

    expect(token.accessToken).toBe("new-access");
    expect(token.userId).toBe("12345");
    expect(refresh).toHaveBeenCalledWith("old-refresh");
    const persistedValues = database.query.mock.calls[2]?.[1] as string[];
    expect(decryptToken(persistedValues[2], encryptionKey)).toBe("new-access");
    expect(decryptToken(persistedValues[3], encryptionKey)).toBe("new-refresh");
    expect(persistedValues[6]).toBe("12345");
  });

  it("serializes refresh for the same user and reuses the rotated token", async () => {
    const encryptionKey = Buffer.alloc(32, 11).toString("base64");
    let row = {
      access_token_expires_at: new Date("2026-09-20T01:00:30.000Z"),
      auth0_subject: "auth0|listener-a",
      encrypted_access_token: encryptToken("old-access", encryptionKey),
      encrypted_refresh_token: encryptToken("old-refresh", encryptionKey),
      scope: "playlists.read search.read playback user.read",
      status: "connected",
      updated_at: new Date("2026-09-20T00:00:00.000Z"),
    };
    const database = {
      query: vi.fn(async (text: string, values?: unknown[]) => {
        if (text.includes("INSERT INTO tidal_connections")) {
          row = {
            ...row,
            access_token_expires_at: values?.[4] as Date,
            encrypted_access_token: values?.[2] as string,
            encrypted_refresh_token: values?.[3] as string,
          };
        }
        return { rows: [row] };
      }),
    } as unknown as QueryExecutor;
    const refresh = vi.fn().mockResolvedValue({
      accessToken: "new-access",
      expiresIn: 7200,
      refreshToken: "new-refresh",
      scope: row.scope,
    });
    const dependencies = {
      encryptionKey,
      executor: database,
      now: () => new Date("2026-09-20T01:00:00.000Z"),
      refresh,
    };

    const [first, second] = await Promise.all([
      getUsableTidalAccessToken("auth0|listener-a", dependencies),
      getUsableTidalAccessToken("auth0|listener-a", dependencies),
    ]);

    expect(first.accessToken).toBe("new-access");
    expect(second.accessToken).toBe("new-access");
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(database.query).toHaveBeenCalledWith(
      expect.stringMatching(/FOR UPDATE/i),
      ["auth0|listener-a"],
    );
  });
});
