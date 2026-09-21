import { describe, expect, it } from "vitest";

import { parseLikeKey, parseLikeSnapshot } from "./types";

describe("like input parsing", () => {
  it("accepts a bounded TIDAL track snapshot and drops unknown metadata", () => {
    expect(parseLikeKey("track", "tidal", " 42 ")).toEqual({
      entityType: "track",
      source: "tidal",
      sourceId: "42",
    });
    expect(parseLikeSnapshot("track", {
      artworkUrl: "https://resources.tidal.com/cover.jpg",
      metadata: {
        album: "Homogenic",
        durationSeconds: 300,
        ignored: "not persisted",
        playbackAvailable: true,
      },
      subtitle: "Björk",
      title: " Jóga ",
    })).toEqual({
      artworkUrl: "https://resources.tidal.com/cover.jpg",
      metadata: {
        album: "Homogenic",
        durationSeconds: 300,
        playbackAvailable: true,
      },
      subtitle: "Björk",
      title: "Jóga",
    });
  });

  it.each([
    ["video", "tidal", "42", "invalid_like_type"],
    ["track", "spotify", "42", "invalid_like_source"],
    ["track", "tidal", "", "invalid_like_id"],
    ["track", "tidal", "x".repeat(301), "invalid_like_id"],
  ])("rejects invalid key input", (entityType, source, sourceId, code) => {
    expect(() => parseLikeKey(entityType, source, sourceId)).toThrow(code);
  });

  it("rejects unsafe artwork URLs and malformed snapshots", () => {
    expect(() => parseLikeSnapshot("album", {
      artworkUrl: "http://example.com/cover.jpg",
      metadata: {},
      subtitle: "Artist",
      title: "Album",
    })).toThrow("invalid_like_artwork");
    expect(() => parseLikeSnapshot("artist", {
      artworkUrl: "",
      metadata: {},
      subtitle: "",
      title: " ",
    })).toThrow("invalid_like_snapshot");
  });
});
