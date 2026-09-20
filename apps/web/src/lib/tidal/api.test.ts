import { describe, expect, it, vi } from "vitest";

import {
  TidalApiError,
  listUserPlaylists,
  parsePlaylistItems,
} from "./api";

const credentials = {
  accessToken: "access-token",
  apiBaseUrl: "https://openapi.tidal.com/v2",
  countryCode: "KR",
};

const playlistDocument = {
  data: [
    {
      attributes: {
        description: "Opaque IDs stay opaque",
        name: "Morning",
        numberOfTrackItems: 3,
      },
      id: "playlist:01H-opaque",
      relationships: {
        coverArt: { data: [{ id: "playlist-art", type: "artworks" }] },
      },
      type: "playlists",
    },
  ],
  included: [
    {
      attributes: {
        files: [
          { href: "https://resources.tidal.com/playlist-320.jpg", meta: { height: 320, width: 320 } },
        ],
        mediaType: "IMAGE",
      },
      id: "playlist-art",
      type: "artworks",
    },
  ],
  links: {
    next: "https://openapi.tidal.com/v2/playlists?page[cursor]=next-token",
  },
};

const trackDocument = {
  data: [
    {
      id: "track-1",
      meta: { addedAt: "2026-09-20T00:00:00.000Z" },
      type: "tracks",
    },
  ],
  included: [
    {
      attributes: { duration: "PT3M5S", isrc: "USABC2300001", title: "Track" },
      id: "track-1",
      relationships: {
        albums: { data: [{ id: "album-1", type: "albums" }] },
        artists: { data: [{ id: "artist-1", type: "artists" }] },
      },
      type: "tracks",
    },
    {
      attributes: { title: "Album" },
      id: "album-1",
      relationships: {
        coverArt: { data: [{ id: "album-art", type: "artworks" }] },
      },
      type: "albums",
    },
    { attributes: { name: "Artist" }, id: "artist-1", type: "artists" },
    {
      attributes: {
        files: [
          { href: "https://resources.tidal.com/album-80.jpg", meta: { height: 80, width: 80 } },
          { href: "https://resources.tidal.com/album-640.jpg", meta: { height: 640, width: 640 } },
        ],
        mediaType: "IMAGE",
      },
      id: "album-art",
      type: "artworks",
    },
  ],
  links: { next: null },
};

describe("TIDAL JSON:API adapter", () => {
  it("keeps opaque playlist ids and the next cursor unchanged", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      Response.json(playlistDocument, {
        headers: { "content-type": "application/vnd.api+json" },
      }),
    );

    const page = await listUserPlaylists(credentials, fetcher);

    expect(page.items[0]).toMatchObject({
      artworkUrl: "https://resources.tidal.com/playlist-320.jpg",
      id: "playlist:01H-opaque",
      trackCount: 3,
    });
    expect(page.next).toBe(
      "https://openapi.tidal.com/v2/playlists?page[cursor]=next-token",
    );
    const requestUrl = new URL(fetcher.mock.calls[0]?.[0] as string);
    expect(requestUrl.searchParams.get("filter[owners.id]")).toBe("me");
    expect(requestUrl.searchParams.get("countryCode")).toBe("KR");
    expect(requestUrl.searchParams.get("include")).toBe("coverArt");
  });

  it("joins track album artist and the largest artwork from included resources", () => {
    const page = parsePlaylistItems(trackDocument, 20);

    expect(page.tracks[0]).toEqual({
      addedAt: new Date("2026-09-20T00:00:00.000Z"),
      position: 20,
      track: {
        albumName: "Album",
        artistName: "Artist",
        durationMs: 185_000,
        isrc: "USABC2300001",
        tidalAlbumId: "album-1",
        tidalArtworkUrl: "https://resources.tidal.com/album-640.jpg",
        tidalTrackId: "track-1",
        title: "Track",
      },
    });
    expect(page.next).toBeNull();
  });

  it.each([
    [401, "reauthenticate"],
    [403, "reauthenticate"],
    [429, "retryable"],
    [503, "retryable"],
    [400, "invalid_response"],
  ] as const)("classifies HTTP %s as %s", async (status, kind) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(null, { status }));

    await expect(listUserPlaylists(credentials, fetcher)).rejects.toEqual(
      expect.objectContaining<TidalApiError>({ kind }),
    );
  });

  it("rejects a next-page URL outside the configured TIDAL API origin", async () => {
    const fetcher = vi.fn();

    await expect(
      listUserPlaylists(
        credentials,
        fetcher,
        "https://attacker.example/steal-access-token",
      ),
    ).rejects.toEqual(
      expect.objectContaining<TidalApiError>({ kind: "invalid_response" }),
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
});
