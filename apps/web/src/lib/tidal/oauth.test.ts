import { describe, expect, it, vi } from "vitest";

import {
  createTidalAuthorizationRequest,
  exchangeTidalCode,
  readTidalOAuthConfig,
  refreshTidalToken,
  toTidalDeviceOAuthConfig,
} from "./oauth";

const config = {
  authorizeUrl: "https://login.tidal.com/authorize",
  clientId: "tidal-client",
  redirectUri: "https://mrms.approid.team/api/tidal/callback",
  scopes: ["playlists.read"],
  tokenUrl: "https://auth.tidal.com/v1/oauth2/token",
};

describe("TIDAL OAuth", () => {
  it("keeps a Limited Input Device client separate from the catalog client", () => {
    const loaded = readTidalOAuthConfig({
      NODE_ENV: "test",
      TIDAL_CLIENT_ID: "catalog-client",
      TIDAL_DEVICE_CLIENT_ID: "device-client",
      TIDAL_DEVICE_CLIENT_SECRET: "device-secret",
      TIDAL_REDIRECT_URI: config.redirectUri,
    });

    const device = toTidalDeviceOAuthConfig(loaded);

    expect(loaded.clientId).toBe("catalog-client");
    expect(device.clientId).toBe("device-client");
    expect(device.clientSecret).toBe("device-secret");
  });

  it("builds an authorization request with S256 PKCE and state", () => {
    const request = createTidalAuthorizationRequest(config);
    const url = new URL(request.url);

    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toBe("playlists.read");
    expect(request.state).toHaveLength(43);
    expect(request.verifier).toHaveLength(43);
  });

  it("exchanges a code without exposing the verifier in the result", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "access-token",
          expires_in: 86400,
          refresh_token: "refresh-token",
          scope: "playlists.read",
          token_type: "Bearer",
          user_id: 12345,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const token = await exchangeTidalCode(
      { code: "authorization-code", verifier: "v".repeat(43) },
      config,
      fetcher,
    );

    expect(token.accessToken).toBe("access-token");
    expect(token.refreshToken).toBe("refresh-token");
    expect(token.userId).toBe("12345");
    expect(fetcher).toHaveBeenCalledWith(
      config.tokenUrl,
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.stringify(token)).not.toContain("v".repeat(43));
  });

  it("refreshes with the stored refresh token and keeps a rotated token", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "new-access",
          expires_in: 7200,
          refresh_token: "new-refresh",
          scope: "playlists.read search.read playback user.read",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const token = await refreshTidalToken("old-refresh", config, fetcher);

    expect(token.accessToken).toBe("new-access");
    expect(token.refreshToken).toBe("new-refresh");
    const request = fetcher.mock.calls[0]?.[1] as RequestInit;
    expect(request.body?.toString()).toContain("grant_type=refresh_token");
    expect(request.body?.toString()).toContain("refresh_token=old-refresh");
  });

  it("keeps the old refresh token when the server does not rotate it", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ access_token: "new-access", expires_in: 7200 }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );

    const token = await refreshTidalToken("old-refresh", config, fetcher);

    expect(token.refreshToken).toBe("old-refresh");
  });

  it("uses HTTP Basic client authentication for a confidential client refresh", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json({ access_token: "new-access", expires_in: 7200 }),
    );

    await refreshTidalToken("old-refresh", {
      ...config,
      clientSecret: "device-secret",
    }, fetcher);

    const request = fetcher.mock.calls[0]?.[1] as RequestInit;
    expect(request.headers).toMatchObject({
      authorization: `Basic ${Buffer.from("tidal-client:device-secret").toString("base64")}`,
    });
    expect(request.body?.toString()).not.toContain("client_id=");
  });
});
