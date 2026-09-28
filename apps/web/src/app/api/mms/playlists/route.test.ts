import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  list: vi.fn(),
  listForTrack: vi.fn(),
  requireSubject: vi.fn(),
}));

vi.mock("@/lib/auth/auth0", () => ({ requireAuth0Subject: mocks.requireSubject }));
vi.mock("@/lib/db/mms-playlists", () => ({
  createMmsPlaylist: mocks.create,
  getMmsPlaylists: mocks.list,
  getMmsPlaylistsForTrack: mocks.listForTrack,
}));

import { GET, POST } from "./route";

const playlist = {
  createdAt: "2026-09-28T00:00:00.000Z",
  description: null,
  id: "11111111-1111-4111-8111-111111111111",
  name: "밤 산책",
  trackCount: 0,
  updatedAt: "2026-09-28T00:00:00.000Z",
};

describe("/api/mms/playlists", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSubject.mockResolvedValue("auth0|listener-a");
    mocks.list.mockResolvedValue([playlist]);
    mocks.listForTrack.mockResolvedValue([{ ...playlist, containsTrack: true }]);
    mocks.create.mockResolvedValue(playlist);
  });

  it("marks playlists that already contain a requested track", async () => {
    const response = await GET(new Request("http://localhost/api/mms/playlists?trackKey=tidal%3A42"));
    expect(response.status).toBe(200);
    expect(mocks.listForTrack).toHaveBeenCalledWith("auth0|listener-a", "tidal:42");
  });

  it("lists the authenticated user's playlists", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ playlists: [playlist] });
    expect(mocks.list).toHaveBeenCalledWith("auth0|listener-a");
  });

  it("creates a normalized playlist", async () => {
    const response = await POST(new Request("http://localhost/api/mms/playlists", {
      body: JSON.stringify({ name: "  밤 산책  ", description: "" }),
      headers: { "content-type": "application/json" },
      method: "POST",
    }));
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith("auth0|listener-a", {
      description: null,
      name: "밤 산책",
    });
  });

  it("rejects invalid input and missing authentication", async () => {
    const invalid = await POST(new Request("http://localhost/api/mms/playlists", {
      body: JSON.stringify({ name: "" }),
      method: "POST",
    }));
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual({ code: "invalid_playlist_name" });

    mocks.requireSubject.mockRejectedValue(new Error("unauthorized"));
    const unauthorized = await GET();
    expect(unauthorized.status).toBe(401);
  });
});
