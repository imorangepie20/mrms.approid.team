import { afterEach, expect, it, vi } from "vitest";

import { GET, handleTidalCallback } from "./route";

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => ({
      value: name === "tidal_oauth_state" ? "expected-state" : "v".repeat(43),
    }),
  })),
}));

vi.mock("@/lib/auth/auth0", () => ({
  requireAuth0Subject: vi.fn(async () => "auth0|listener"),
}));

vi.mock("@/lib/auth/token-cipher", () => ({
  encryptToken: vi.fn(() => "encrypted-token"),
}));

vi.mock("@/lib/db/user-connections", () => ({
  upsertUserConnection: vi.fn(async () => undefined),
}));

vi.mock("@/lib/tidal/oauth", () => ({
  exchangeTidalCode: vi.fn(async () => ({
    accessToken: "access-token",
    expiresIn: 3600,
    refreshToken: "refresh-token",
    scope: "playlists.read",
  })),
  readTidalOAuthConfig: vi.fn(() => ({
    authorizeUrl: "https://login.tidal.com/authorize",
    clientId: "client-id",
    redirectUri: "https://mrms.approid.team/api/tidal/callback",
    scopes: ["playlists.read"],
    tokenUrl: "https://auth.tidal.com/v1/oauth2/token",
  })),
}));

afterEach(() => {
  delete process.env.APP_BASE_URL;
  delete process.env.TOKEN_ENCRYPTION_KEY;
});

it("does not persist a connection when callback state is invalid", async () => {
  const persistConnection = vi.fn();
  const exchangeCode = vi.fn();

  const result = await handleTidalCallback(
    {
      auth0Subject: "auth0|listener",
      code: "authorization-code",
      state: "invalid-state",
      storedState: "expected-state",
      verifier: "v".repeat(43),
    },
    { exchangeCode, persistConnection },
  );

  expect(result).toEqual({ ok: false, status: 400 });
  expect(exchangeCode).not.toHaveBeenCalled();
  expect(persistConnection).not.toHaveBeenCalled();
});

it("redirects a successful callback to the configured public app URL", async () => {
  process.env.APP_BASE_URL = "https://mrms.approid.team";
  process.env.TOKEN_ENCRYPTION_KEY = "test-encryption-key";

  const response = await GET(
    new Request(
      "http://localhost:44119/api/tidal/callback?code=authorization-code&state=expected-state",
    ),
  );

  expect(response.headers.get("location")).toBe(
    "https://mrms.approid.team/onboarding?tidal=connected",
  );
});
