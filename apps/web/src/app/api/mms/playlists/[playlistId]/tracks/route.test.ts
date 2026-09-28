import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ addTrack: vi.fn(), requireSubject: vi.fn() }));

vi.mock("@/lib/auth/auth0", () => ({ requireAuth0Subject: mocks.requireSubject }));
vi.mock("@/lib/db/mms-playlists", async () => {
  const actual = await vi.importActual<typeof import("@/lib/db/mms-playlists")>("@/lib/db/mms-playlists");
  return { ...actual, addMmsPlaylistTrack: mocks.addTrack };
});

import { MmsPlaylistRepositoryError } from "@/lib/db/mms-playlists";
import { POST } from "./route";

const playlistId = "11111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ playlistId }) };
const input = {
  album: "Homogenic",
  artist: "Björk",
  artworkUrl: "",
  durationSeconds: 300,
  playbackAvailable: true,
  source: "tidal",
  sourceId: "42",
  tidalTrackId: "42",
  title: "Jóga",
};

describe("/api/mms/playlists/[playlistId]/tracks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSubject.mockResolvedValue("auth0|listener-a");
    mocks.addTrack.mockResolvedValue({ id: "item-1", trackKey: "tidal:42" });
  });

  it("adds a validated track snapshot", async () => {
    const response = await POST(new Request("http://localhost", {
      body: JSON.stringify(input),
      method: "POST",
    }), context);
    expect(response.status).toBe(201);
    expect(mocks.addTrack).toHaveBeenCalledWith(
      "auth0|listener-a",
      playlistId,
      expect.objectContaining({ trackKey: "tidal:42" }),
    );
  });

  it("maps duplicate and ownership failures", async () => {
    mocks.addTrack.mockRejectedValueOnce(new MmsPlaylistRepositoryError("playlist_track_already_exists"));
    const duplicate = await POST(new Request("http://localhost", {
      body: JSON.stringify(input),
      method: "POST",
    }), context);
    expect(duplicate.status).toBe(409);

    mocks.addTrack.mockRejectedValueOnce(new MmsPlaylistRepositoryError("playlist_not_found"));
    const missing = await POST(new Request("http://localhost", {
      body: JSON.stringify(input),
      method: "POST",
    }), context);
    expect(missing.status).toBe(404);
  });
});
