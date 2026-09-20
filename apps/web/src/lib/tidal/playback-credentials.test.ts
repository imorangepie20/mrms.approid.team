import { describe, expect, it, vi } from "vitest";

import {
  getPlaybackCredentials,
  PlaybackCredentialsError,
} from "./playback-credentials";

const config = {
  authorizeUrl: "https://login.tidal.com/authorize",
  clientId: "tidal-client",
  redirectUri: "https://app.example/callback",
  scopes: ["playlists.read", "search.read", "playback", "user.read"],
  tokenUrl: "https://auth.tidal.com/v1/oauth2/token",
};

describe("playback credentials", () => {
  it("returns player credentials without the refresh token", async () => {
    const getAccessToken = vi.fn().mockResolvedValue({
      accessToken: "access",
      expiresAt: new Date(1_795_000_000_000),
      scope: "playlists.read search.read playback user.read",
    });

    const credentials = await getPlaybackCredentials("auth0|listener", {
      getAccessToken,
      readConfig: () => config,
    });

    expect(credentials).toEqual({
      clientId: "tidal-client",
      expires: 1_795_000_000_000,
      grantedScopes: ["playlists.read", "search.read", "playback", "user.read"],
      requestedScopes: ["playlists.read", "search.read", "playback", "user.read"],
      token: "access",
    });
    expect(credentials).not.toHaveProperty("refreshToken");
  });

  it("rejects credentials that do not grant playback", async () => {
    const getAccessToken = vi.fn().mockResolvedValue({
      accessToken: "access",
      expiresAt: new Date(1_795_000_000_000),
      scope: "playlists.read search.read",
    });

    await expect(
      getPlaybackCredentials("auth0|listener", {
        getAccessToken,
        readConfig: () => config,
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<PlaybackCredentialsError>>({
        code: "tidal_playback_scope_required",
      }),
    );
  });
});
