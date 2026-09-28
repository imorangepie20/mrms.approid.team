import { describe, expect, it } from "vitest";

import {
  parseMmsPlaylistCreate,
  parseMmsPlaylistPatch,
  parseMmsPlaylistReorder,
  parseMmsPlaylistTrack,
  playlistTrackInput,
} from "./playlists";

describe("MMS playlist input", () => {
  it("normalizes playlist metadata", () => {
    expect(parseMmsPlaylistCreate({ name: "  밤 산책  ", description: "  조용한 곡  " })).toEqual({
      description: "조용한 곡",
      name: "밤 산책",
    });
    expect(parseMmsPlaylistPatch({ description: "   " })).toEqual({ description: null });
  });

  it("rejects empty or oversized metadata and empty patches", () => {
    expect(() => parseMmsPlaylistCreate({ name: "   " })).toThrow("invalid_playlist_name");
    expect(() => parseMmsPlaylistCreate({ name: "a".repeat(101) })).toThrow("invalid_playlist_name");
    expect(() => parseMmsPlaylistCreate({ name: "ok", description: "a".repeat(501) })).toThrow("invalid_playlist_description");
    expect(() => parseMmsPlaylistPatch({})).toThrow("invalid_playlist_patch");
  });

  it("uses a canonical TIDAL identity and accepts a bounded track snapshot", () => {
    const input = playlistTrackInput({
      album: "Homogenic",
      artist: "Björk",
      artworkClass: "from-violet-500 to-sky-500",
      artworkUrl: "https://resources.tidal.com/cover.jpg",
      durationSeconds: 300,
      id: "ems-row-7",
      playbackAvailable: true,
      tidalTrackId: "42",
      title: "Jóga",
    });

    expect(input).toMatchObject({ source: "tidal", sourceId: "42", tidalTrackId: "42" });
    expect(parseMmsPlaylistTrack(input)).toMatchObject({
      album: "Homogenic",
      artist: "Björk",
      trackKey: "tidal:42",
    });
  });

  it("rejects unsupported sources, unsafe artwork, and malformed duration", () => {
    const base = {
      album: "Album",
      artist: "Artist",
      artworkUrl: "",
      durationSeconds: null,
      playbackAvailable: true,
      source: "catalog",
      sourceId: "track-1",
      tidalTrackId: null,
      title: "Track",
    };
    expect(() => parseMmsPlaylistTrack({ ...base, source: "spotify" })).toThrow("invalid_playlist_track_source");
    expect(() => parseMmsPlaylistTrack({ ...base, artworkUrl: "javascript:alert(1)" })).toThrow("invalid_playlist_track_artwork");
    expect(() => parseMmsPlaylistTrack({ ...base, durationSeconds: -1 })).toThrow("invalid_playlist_track_duration");
  });

  it("accepts only a non-empty unique UUID order", () => {
    const first = "11111111-1111-4111-8111-111111111111";
    const second = "22222222-2222-4222-8222-222222222222";
    expect(parseMmsPlaylistReorder({ itemIds: [first, second] })).toEqual([first, second]);
    expect(() => parseMmsPlaylistReorder({ itemIds: [first, first] })).toThrow("invalid_playlist_track_order");
    expect(() => parseMmsPlaylistReorder({ itemIds: [] })).toThrow("invalid_playlist_track_order");
  });
});
