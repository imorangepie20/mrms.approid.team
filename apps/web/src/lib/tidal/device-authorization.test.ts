import { describe, expect, it, vi } from "vitest";

import {
  pollTidalDeviceAuthorization,
  startTidalDeviceAuthorization,
} from "./device-authorization";

const config = {
  authorizeUrl: "https://login.tidal.com/authorize",
  clientId: "client-id",
  clientSecret: "client-secret",
  deviceAuthorizationUrl: "https://auth.tidal.com/v1/oauth2/device_authorization",
  deviceScopes: ["r_usr", "r_stream"],
  redirectUri: "https://mrms.approid.team/api/tidal/callback",
  scopes: ["playlists.read", "search.read", "playback", "user.read"],
  tokenUrl: "https://auth.tidal.com/v1/oauth2/token",
};

describe("TIDAL device authorization", () => {
  it("parses camel-case device authorization fields", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      deviceCode: "device-1",
      userCode: "ABCD",
      verificationUri: "https://link.tidal.com",
      verificationUriComplete: "https://link.tidal.com/ABCD",
      expiresIn: 300,
      interval: 5,
    }), { status: 200 }));

    const result = await startTidalDeviceAuthorization(config, fetcher, () => 1_000);

    expect(result).toEqual({
      deviceCode: "device-1",
      userCode: "ABCD",
      verificationUri: "https://link.tidal.com",
      verificationUriComplete: "https://link.tidal.com/ABCD",
      expiresAt: new Date(301_000),
      intervalSeconds: 5,
    });
    const request = fetcher.mock.calls[0]?.[1] as RequestInit;
    expect(request.body?.toString()).toContain("scope=r_usr+r_stream");
  });

  it.each(["authorization_pending", "slow_down"] as const)(
    "preserves %s while polling",
    async (status) => {
      const fetcher = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: status }), { status: 400 }),
      );

      await expect(
        pollTidalDeviceAuthorization("device-1", config, fetcher),
      ).resolves.toEqual({ status });
    },
  );

  it("parses a connected device token", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      access_token: "access",
      expires_in: 3600,
      refresh_token: "refresh",
      scope: "r_usr r_stream",
      user_id: 123,
    }), { status: 200 }));

    await expect(
      pollTidalDeviceAuthorization("device-1", config, fetcher),
    ).resolves.toEqual({
      status: "connected",
      token: {
        accessToken: "access",
        expiresIn: 3600,
        refreshToken: "refresh",
        scope: "r_usr r_stream",
        userId: "123",
      },
    });
  });
});
