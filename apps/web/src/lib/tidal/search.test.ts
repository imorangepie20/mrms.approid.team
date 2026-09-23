import { describe, expect, it, vi } from "vitest";

import {
  emptySearchResult,
  searchTidalCatalog,
  suggestTidalSearch,
} from "./search";

const credentials = {
  accessToken: "access-token",
  apiBaseUrl: "https://openapi.tidal.com/v2",
  countryCode: "KR",
};

const searchDocument = {
  data: [
    {
      id: "search:opaque",
      relationships: {
        albums: { data: [{ id: "album:opaque", type: "albums" }] },
        artists: { data: [{ id: "artist:opaque", type: "artists" }] },
        playlists: { data: [{ id: "playlist:opaque", type: "playlists" }] },
        topHits: { data: [
          { id: "artist:opaque", type: "artists" },
          { id: "album:opaque", type: "albums" },
          { id: "track:opaque", type: "tracks" },
          { id: "playlist:opaque", type: "playlists" },
        ] },
        tracks: { data: [{ id: "track:opaque", type: "tracks" }] },
      },
      type: "searchResults",
    },
  ],
  included: [
    {
      attributes: { duration: "PT4M2S", title: "Human Behaviour" },
      id: "track:opaque",
      relationships: {
        albums: { data: [{ id: "album:opaque", type: "albums" }] },
        artists: { data: [{ id: "artist:opaque", type: "artists" }] },
      },
      type: "tracks",
    },
    {
      attributes: { title: "Debut" },
      id: "album:opaque",
      relationships: {
        artists: { data: [{ id: "artist:opaque", type: "artists" }] },
        coverArt: { data: [{ id: "art:opaque", type: "artworks" }] },
      },
      type: "albums",
    },
    {
      attributes: { name: "Björk" },
      id: "artist:opaque",
      relationships: {
        profileArt: { data: [{ id: "artist-art:opaque", type: "artworks" }] },
      },
      type: "artists",
    },
    {
      attributes: {
        name: "Björk Essentials",
        numberOfTrackItems: 25,
      },
      id: "playlist:opaque",
      relationships: {
        coverArt: { data: [{ id: "playlist-art:opaque", type: "artworks" }] },
      },
      type: "playlists",
    },
    {
      attributes: {
        files: [{ href: "https://resources.tidal.com/playlist-640.jpg", meta: { height: 640, width: 640 } }],
      },
      id: "playlist-art:opaque",
      type: "artworks",
    },
    {
      attributes: {
        files: [{ href: "https://resources.tidal.com/artist-640.jpg", meta: { height: 640, width: 640 } }],
      },
      id: "artist-art:opaque",
      type: "artworks",
    },
    {
      attributes: {
        files: [
          { href: "https://resources.tidal.com/80.jpg", meta: { height: 80, width: 80 } },
          { href: "https://resources.tidal.com/640.jpg", meta: { height: 640, width: 640 } },
        ],
      },
      id: "art:opaque",
      type: "artworks",
    },
  ],
  links: {
    next: "https://openapi.tidal.com/v2/searchResults?page[cursor]=next",
  },
};

describe("TIDAL search adapter", () => {
  it("returns no results without making a request for blank input", async () => {
    const fetcher = vi.fn();

    await expect(
      searchTidalCatalog("   ", credentials, fetcher),
    ).resolves.toEqual(emptySearchResult);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("normalizes opaque track, album, playlist, artist, artwork, and cursor values", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json(searchDocument));

    const result = await searchTidalCatalog("  Björk  ", credentials, fetcher);

    expect(result.tracks[0]).toMatchObject({
      album: "Debut",
      artist: "Björk",
      artworkUrl: "https://resources.tidal.com/640.jpg",
      durationSeconds: 242,
      tidalTrackId: "track:opaque",
      title: "Human Behaviour",
    });
    expect(result.albums[0]).toMatchObject({
      artist: "Björk",
      id: "album:opaque",
      title: "Debut",
    });
    expect(result.playlists[0]).toEqual({
      artworkUrl: "https://resources.tidal.com/playlist-640.jpg",
      curator: "TIDAL",
      id: "playlist:opaque",
      title: "Björk Essentials",
      trackCount: 25,
    });
    expect(result.artists[0]).toEqual({
      artworkUrl: "https://resources.tidal.com/artist-640.jpg",
      id: "artist:opaque",
      name: "Björk",
    });
    expect(result.topHits.map((hit) => [hit.kind, hit.id])).toEqual([
      ["artist", "artist:opaque"],
      ["album", "album:opaque"],
      ["track", "track:opaque"],
      ["playlist", "playlist:opaque"],
    ]);
    expect(result.next).toBe(searchDocument.links.next);

    const requestUrl = new URL(fetcher.mock.calls[0]?.[0] as URL);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(requestUrl.pathname).toBe("/v2/searchResults");
    expect(requestUrl.searchParams.get("filter[query]")).toBe("Björk");
    expect(requestUrl.searchParams.get("include")).toBe(
      "topHits,tracks,albums,artists,playlists,tracks.albums,tracks.artists,albums.coverArt,artists.profileArt,playlists.coverArt",
    );
    expect((requestUrl.searchParams.get("include") ?? "").split(",")).toHaveLength(10);
  });

  it.each([
    [["STREAM", "DJ"], true],
    [["DJ"], false],
  ])("maps availability %j to playbackAvailable=%s", async (availability, playbackAvailable) => {
    const document = structuredClone(searchDocument);
    const track = document.included.find((item) => item.type === "tracks");
    if (!track) throw new Error("track fixture is missing");
    const attributes = track.attributes as Record<string, unknown>;
    attributes.availability = availability;
    const fetcher = vi.fn().mockResolvedValue(Response.json(document));

    const result = await searchTidalCatalog("Björk", credentials, fetcher);

    expect(result.tracks[0]).toMatchObject({ playbackAvailable });
  });

  it("rejects a cursor outside the configured API origin", async () => {
    const fetcher = vi.fn();

    await expect(
      searchTidalCatalog(
        "Björk",
        credentials,
        fetcher,
        "https://attacker.example/cursor",
      ),
    ).rejects.toEqual(expect.objectContaining({ kind: "invalid_response" }));
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("does not fan out detail requests when included track metadata is incomplete", async () => {
    const incomplete = {
      data: [{
        id: "search",
        relationships: { tracks: { data: [{ id: "track:opaque", type: "tracks" }] } },
        type: "searchResults",
      }],
      included: [{ attributes: { title: "Human Behaviour" }, id: "track:opaque", type: "tracks" }],
    };
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json(incomplete));

    const result = await searchTidalCatalog("Björk", credentials, fetcher);

    expect(result.tracks[0]).toMatchObject({
      album: "Unknown Album",
      artist: "Unknown Artist",
      artworkUrl: "",
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("requests direct search suggestions without history", async () => {
    const document = {
      data: [{
        id: "suggestions",
        relationships: {
          directHits: { data: [{ id: "hit-1", type: "searchSuggestionItems" }] },
          history: { data: [{ id: "history-1", type: "searchSuggestionItems" }] },
        },
        type: "searchSuggestions",
      }],
      included: [
        { attributes: { query: "Björk" }, id: "hit-1", type: "searchSuggestionItems" },
        { attributes: { query: "old query" }, id: "history-1", type: "searchSuggestionItems" },
      ],
    };
    const fetcher = vi.fn().mockResolvedValue(Response.json(document));

    await expect(suggestTidalSearch(" bj ", credentials, fetcher)).resolves.toEqual([
      "Björk",
    ]);
    const requestUrl = new URL(fetcher.mock.calls[0]?.[0] as URL);
    expect(requestUrl.searchParams.get("include")).toBe("directHits");
  });
});
