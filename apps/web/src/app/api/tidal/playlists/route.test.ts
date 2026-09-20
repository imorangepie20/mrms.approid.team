import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getToken: vi.fn(),
  listPlaylists: vi.fn(),
  requireSubject: vi.fn(),
}));

vi.mock("@/lib/auth/auth0", () => ({
  requireAuth0Subject: mocks.requireSubject,
}));

vi.mock("@/lib/db/user-connections", () => ({
  getUsableTidalAccessToken: mocks.getToken,
}));

vi.mock("@/lib/tidal/api", () => ({
  listUserPlaylists: mocks.listPlaylists,
}));

import { GET } from "./route";

describe("GET /api/tidal/playlists", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.TIDAL_API_BASE_URL = "https://openapi.tidal.com/v2";
    process.env.TIDAL_COUNTRY_CODE = "KR";
    mocks.requireSubject.mockResolvedValue("auth0|listener");
    mocks.getToken.mockResolvedValue({
      accessToken: "server-secret-access",
      expiresAt: new Date("2026-09-20T01:00:00.000Z"),
      scope: "playlists.read",
    });
    mocks.listPlaylists.mockResolvedValue({
      items: [{ id: "playlist:opaque", name: "Morning", trackCount: 3 }],
      next: null,
    });
  });

  it("returns normalized playlists without exposing the access token", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      next: null,
      playlists: [{ id: "playlist:opaque", name: "Morning", trackCount: 3 }],
    });
    expect(JSON.stringify(body)).not.toContain("server-secret-access");
  });

  it("returns 401 when authentication fails", async () => {
    mocks.requireSubject.mockRejectedValue(new Error("unauthorized"));

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ code: "unauthorized" });
    expect(mocks.getToken).not.toHaveBeenCalled();
  });
});
