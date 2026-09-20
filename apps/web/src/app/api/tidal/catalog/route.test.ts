import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCatalogTrackPages: vi.fn(),
  getToken: vi.fn(),
  requireSubject: vi.fn(),
}));

vi.mock("@/lib/auth/auth0", () => ({ requireAuth0Subject: mocks.requireSubject }));
vi.mock("@/lib/db/user-connections", () => ({ getUsableTidalAccessToken: mocks.getToken }));
vi.mock("@/lib/tidal/api", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/tidal/api")>();
  return { ...original, getCatalogTrackPages: mocks.getCatalogTrackPages };
});

import { GET } from "./route";

describe("GET /api/tidal/catalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireSubject.mockResolvedValue("auth0|listener");
    mocks.getToken.mockResolvedValue({ accessToken: "secret" });
    mocks.getCatalogTrackPages.mockReturnValue((async function* () {
      yield {
        next: null,
        tracks: [{
          addedAt: null,
          position: 0,
          track: {
            albumName: "Debut",
            artistName: "Björk",
            durationMs: 242_000,
            isrc: "GBBTF9300010",
            tidalAlbumId: "album-1",
            tidalArtworkUrl: "https://resources.tidal.com/album.jpg",
            tidalTrackId: "track-7",
            title: "Human Behaviour",
          },
        }],
      };
    })());
  });

  it("returns playable album tracks without exposing credentials", async () => {
    const response = await GET(new Request(
      "http://localhost/api/tidal/catalog?type=album&id=album-1",
    ));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      tracks: [{
        album: "Debut",
        artist: "Björk",
        artworkClass: "from-violet-500 to-sky-500",
        artworkUrl: "https://resources.tidal.com/album.jpg",
        durationSeconds: 242,
        id: "track-7",
        tidalTrackId: "track-7",
        title: "Human Behaviour",
      }],
    });
    expect(mocks.getCatalogTrackPages).toHaveBeenCalledWith(
      "album",
      "album-1",
      expect.objectContaining({ accessToken: "secret" }),
    );
  });

  it.each([
    ["unsupported type", "artist", "album-1"],
    ["missing id", "album", ""],
  ])("rejects %s before requesting TIDAL", async (_label, type, id) => {
    const url = new URL("http://localhost/api/tidal/catalog");
    url.searchParams.set("type", type);
    url.searchParams.set("id", id);

    const response = await GET(new Request(url));

    expect(response.status).toBe(400);
    expect(mocks.getCatalogTrackPages).not.toHaveBeenCalled();
  });
});
