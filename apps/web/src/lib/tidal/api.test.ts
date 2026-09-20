import { describe, expect, it, vi } from "vitest";

import {
  getCatalogTrackPages,
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
    ["album", "albums/album%3Aopaque/relationships/items", "items,items.albums,items.artists,items.albums.coverArt"],
    ["playlist", "playlists/playlist%3Aopaque/relationships/items", "items,items.albums,items.artists,items.albums.coverArt"],
  ] as const)("loads %s tracks from its items relationship", async (kind, pathname, include) => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(trackDocument));
    const pages = [];

    for await (const page of getCatalogTrackPages(
      kind,
      `${kind}:opaque`,
      credentials,
      fetcher,
    )) {
      pages.push(page);
    }

    expect(pages[0]?.tracks[0]?.track.title).toBe("Track");
    const requestUrl = new URL(fetcher.mock.calls[0]?.[0] as string);
    expect(requestUrl.pathname).toBe(`/v2/${pathname}`);
    expect(requestUrl.searchParams.get("include")).toBe(include);
  });

  it("follows same-origin relative cursors for multi-page playlists", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({
        ...trackDocument,
        links: { next: "/playlists/playlist-1/relationships/items?page[cursor]=next" },
      }))
      .mockResolvedValueOnce(Response.json({ ...trackDocument, links: { next: null } }));
    const pages = [];

    for await (const page of getCatalogTrackPages(
      "playlist",
      "playlist-1",
      credentials,
      fetcher,
    )) {
      pages.push(page);
    }

    expect(pages).toHaveLength(2);
    expect(String(fetcher.mock.calls[1]?.[0])).toBe(
      "https://openapi.tidal.com/v2/playlists/playlist-1/relationships/items?page[cursor]=next",
    );
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
      expect.objectContaining({ kind }),
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
      expect.objectContaining({ kind: "invalid_response" }),
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
});
