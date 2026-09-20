import { describe, expect, it, vi } from "vitest";

import {
  getUserConnection,
  markReauthenticationRequired,
  upsertUserConnection,
  type QueryExecutor,
} from "./user-connections";

function queryExecutor(rows: unknown[] = []) {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
  } satisfies QueryExecutor;
}

describe("user TIDAL connections", () => {
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
      },
      database,
    );

    expect(result.auth0Subject).toBe("auth0|listener-a");
    expect(database.query).toHaveBeenCalledWith(
      expect.stringContaining("ON CONFLICT (user_id)"),
      expect.arrayContaining(["auth0|listener-a", "connected", "encrypted-access"]),
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
});
