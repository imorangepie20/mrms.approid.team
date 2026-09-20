import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireSubject: vi.fn(),
  startImport: vi.fn(),
}));

vi.mock("@/lib/auth/auth0", () => ({ requireAuth0Subject: mocks.requireSubject }));
vi.mock("@/lib/playlists/import-playlists", () => ({
  startPlaylistImport: mocks.startImport,
}));

import { POST } from "./route";

describe("POST /api/playlists/import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSubject.mockResolvedValue("auth0|listener");
    mocks.startImport.mockResolvedValue({ importId: "import-1", reused: false });
  });

  it("starts an import for an authenticated playlist selection", async () => {
    const response = await POST(
      new Request("http://localhost/api/playlists/import", {
        body: JSON.stringify({ playlistIds: ["playlist-a"] }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ importId: "import-1" });
    expect(mocks.startImport).toHaveBeenCalledWith({
      auth0Subject: "auth0|listener",
      playlistIds: ["playlist-a"],
    });
  });

  it("rejects request bodies whose playlistIds is not an array of strings", async () => {
    const response = await POST(
      new Request("http://localhost/api/playlists/import", {
        body: JSON.stringify({ playlistIds: "playlist-a" }),
        headers: { "content-type": "application/json" },
        method: "POST",
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.startImport).not.toHaveBeenCalled();
  });
});
