import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCredentials: vi.fn(),
  requireSubject: vi.fn(),
}));

vi.mock("@/lib/auth/auth0", () => ({
  requireAuth0Subject: mocks.requireSubject,
}));
vi.mock("@/lib/tidal/playback-credentials", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/tidal/playback-credentials")
  >("@/lib/tidal/playback-credentials");
  return { ...actual, getPlaybackCredentials: mocks.getCredentials };
});

import { PlaybackCredentialsError } from "@/lib/tidal/playback-credentials";

import { GET } from "./route";

describe("GET /api/tidal/playback-credentials", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSubject.mockResolvedValue("auth0|listener");
    mocks.getCredentials.mockResolvedValue({
      clientId: "tidal-client",
      expires: 1_795_000_000_000,
      grantedScopes: ["playback"],
      requestedScopes: ["playback"],
      token: "access",
    });
  });

  it("returns non-cacheable credentials for the authenticated user", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).not.toHaveProperty("refreshToken");
    expect(mocks.getCredentials).toHaveBeenCalledWith("auth0|listener");
  });

  it("returns a stable code when playback scope is missing", async () => {
    mocks.getCredentials.mockRejectedValue(
      new PlaybackCredentialsError("tidal_playback_scope_required"),
    );

    const response = await GET();

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      code: "tidal_playback_scope_required",
    });
  });

  it("rejects an anonymous request", async () => {
    mocks.requireSubject.mockRejectedValue(new Error("unauthorized"));

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.getCredentials).not.toHaveBeenCalled();
  });
});
