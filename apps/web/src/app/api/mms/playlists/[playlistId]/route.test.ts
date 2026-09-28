import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deletePlaylist: vi.fn(),
  getPlaylist: vi.fn(),
  requireSubject: vi.fn(),
  updatePlaylist: vi.fn(),
}));

vi.mock("@/lib/auth/auth0", () => ({ requireAuth0Subject: mocks.requireSubject }));
vi.mock("@/lib/db/mms-playlists", () => ({
  deleteMmsPlaylist: mocks.deletePlaylist,
  getMmsPlaylist: mocks.getPlaylist,
  updateMmsPlaylist: mocks.updatePlaylist,
}));

import { DELETE, GET, PATCH } from "./route";

const playlistId = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ playlistId }) };
const playlist = {
  createdAt: "2026-09-28T00:00:00.000Z",
  description: null,
  id: playlistId,
  name: "밤 산책",
  trackCount: 0,
  tracks: [],
  updatedAt: "2026-09-28T00:00:00.000Z",
};

describe("/api/mms/playlists/[playlistId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSubject.mockResolvedValue("auth0|listener-a");
    mocks.getPlaylist.mockResolvedValue(playlist);
    mocks.updatePlaylist.mockResolvedValue({ ...playlist, name: "새 이름" });
    mocks.deletePlaylist.mockResolvedValue(true);
  });

  it("gets, patches, and deletes an owned playlist", async () => {
    const getResponse = await GET(new Request("http://localhost"), context);
    expect(getResponse.status).toBe(200);

    const patchResponse = await PATCH(new Request("http://localhost", {
      body: JSON.stringify({ name: " 새 이름 " }),
      method: "PATCH",
    }), context);
    expect(patchResponse.status).toBe(200);
    expect(mocks.updatePlaylist).toHaveBeenCalledWith("auth0|listener-a", playlistId, { name: "새 이름" });

    const deleteResponse = await DELETE(new Request("http://localhost", { method: "DELETE" }), context);
    expect(deleteResponse.status).toBe(200);
    await expect(deleteResponse.json()).resolves.toEqual({ deleted: true });
  });

  it("hides absent or foreign playlists behind 404", async () => {
    mocks.getPlaylist.mockResolvedValue(null);
    const getResponse = await GET(new Request("http://localhost"), context);
    expect(getResponse.status).toBe(404);

    mocks.updatePlaylist.mockResolvedValue(null);
    const patchResponse = await PATCH(new Request("http://localhost", {
      body: JSON.stringify({ description: "설명" }),
      method: "PATCH",
    }), context);
    expect(patchResponse.status).toBe(404);

    mocks.deletePlaylist.mockResolvedValue(false);
    const deleteResponse = await DELETE(new Request("http://localhost", { method: "DELETE" }), context);
    expect(deleteResponse.status).toBe(404);
  });
});
