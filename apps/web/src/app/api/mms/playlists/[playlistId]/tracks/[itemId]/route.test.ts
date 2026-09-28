import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ deleteTrack: vi.fn(), requireSubject: vi.fn() }));

vi.mock("@/lib/auth/auth0", () => ({ requireAuth0Subject: mocks.requireSubject }));
vi.mock("@/lib/db/mms-playlists", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/mms-playlists")>("@/lib/db/mms-playlists");
  return { ...actual, deleteMmsPlaylistTrack: mocks.deleteTrack };
});

import { MmsPlaylistRepositoryError } from "@/lib/db/mms-playlists";
import { DELETE } from "./route";

const context = { params: Promise.resolve({ playlistId: "playlist-1", itemId: "item-1" }) };

describe("playlist track item route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSubject.mockResolvedValue("auth0|listener-a");
    mocks.deleteTrack.mockResolvedValue(true);
  });

  it("deletes an owned track item", async () => {
    const response = await DELETE(new Request("http://localhost", { method: "DELETE" }), context);
    expect(response.status).toBe(200);
    expect(mocks.deleteTrack).toHaveBeenCalledWith("auth0|listener-a", "playlist-1", "item-1");
  });

  it("returns 404 for a missing item", async () => {
    mocks.deleteTrack.mockRejectedValue(new MmsPlaylistRepositoryError("playlist_track_not_found"));
    const response = await DELETE(new Request("http://localhost", { method: "DELETE" }), context);
    expect(response.status).toBe(404);
  });
});
