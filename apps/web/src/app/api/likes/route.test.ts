import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUserLikes: vi.fn(),
  requireSubject: vi.fn(),
}));

vi.mock("@/lib/auth/auth0", () => ({ requireAuth0Subject: mocks.requireSubject }));
vi.mock("@/lib/db/user-likes", () => ({ getUserLikes: mocks.getUserLikes }));

import { GET } from "./route";

const track = {
  artworkUrl: "",
  createdAt: "2026-09-21T00:00:00.000Z",
  entityType: "track" as const,
  metadata: { album: "Homogenic" },
  source: "tidal" as const,
  sourceId: "42",
  subtitle: "Björk",
  title: "Jóga",
};

describe("GET /api/likes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSubject.mockResolvedValue("auth0|listener-a");
    mocks.getUserLikes.mockResolvedValue([track]);
  });

  it("returns four stable collections and counts", async () => {
    const response = await GET(new Request("http://localhost/api/likes"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      albums: [],
      artists: [],
      counts: { album: 0, artist: 0, playlist: 0, track: 1 },
      playlists: [],
      tracks: [track],
    });
  });

  it("filters a valid type and rejects an invalid type", async () => {
    const filtered = await GET(new Request("http://localhost/api/likes?type=album"));
    expect((await filtered.json()).tracks).toEqual([]);

    const invalid = await GET(new Request("http://localhost/api/likes?type=video"));
    expect(invalid.status).toBe(400);
    expect(mocks.requireSubject).toHaveBeenCalledTimes(1);
  });

  it("returns 401 without a session", async () => {
    mocks.requireSubject.mockRejectedValue(new Error("unauthorized"));

    const response = await GET(new Request("http://localhost/api/likes"));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ code: "unauthorized" });
  });
});
