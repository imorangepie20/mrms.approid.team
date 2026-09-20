import { describe, expect, it, vi } from "vitest";

import {
  TidalDeviceAuthorizationError,
  pollTidalDeviceAuthorization,
  startTidalDeviceAuthorization,
} from "./device-authorization";

const config = {
  authorizeUrl: "https://login.tidal.com/authorize",
  clientId: "client-id",
  clientSecret: "client-secret",
  deviceAuthorizationUrl: "https://auth.tidal.com/v1/oauth2/device_authorization",
  deviceClientId: "device-client-id",
  deviceClientSecret: "device-client-secret",
  deviceScopes: ["r_usr", "w_usr", "w_sub"],
  redirectUri: "https://mrms.approid.team/api/tidal/callback",
  scopes: ["playlists.read", "search.read", "playback", "user.read"],
  tokenUrl: "https://auth.tidal.com/v1/oauth2/token",
};

describe("TIDAL device authorization", () => {
  it("identifies clients that cannot use the device authorization grant", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: "invalid_request",
      error_description: "Client is not a Limited Input Device client",
      sub_status: 1002,
    }), { status: 400 }));

    await expect(startTidalDeviceAuthorization(config, fetcher)).rejects.toEqual(
      new TidalDeviceAuthorizationError("tidal_device_client_unsupported"),
    );
  });

  it("parses camel-case device authorization fields", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      deviceCode: "device-1",
      userCode: "ABCD",
      verificationUri: "link.tidal.com",
      verificationUriComplete: "link.tidal.com/ABCD",
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
    expect(request.body?.toString()).toContain("client_id=device-client-id");
    expect(request.body?.toString()).toContain("scope=r_usr+w_usr+w_sub");
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
      scope: "r_usr w_usr w_sub",
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
        scope: "r_usr w_usr w_sub",
        userId: "123",
      },
    });
    const request = fetcher.mock.calls[0]?.[1] as RequestInit;
    expect(request.headers).toMatchObject({
      authorization: `Basic ${Buffer.from("device-client-id:device-client-secret").toString("base64")}`,
    });
  });
});
