import { describe, expect, it } from "vitest";

import { catalog } from "./fixtures";
import {
  applyPreference,
  buildEmbeddingText,
  getGatewayTracks,
} from "./recommendations";
import type { MusicState, Track } from "./types";

const initialState: MusicState = {
  mmsTrackIds: ["t-1"],
  rejectedTrackIds: [],
};

describe("recommendations", () => {
  it("excludes a rejected track from future gateway tracks", () => {
    const tracks = getGatewayTracks(catalog, ["t-1"], ["t-3"]);

    expect(tracks.map((track) => track.id)).not.toContain("t-3");
  });

  it("does not remove a rejected track from the public catalog", () => {
    const next = applyPreference(initialState, "t-3", "reject");

    expect(catalog.map((track) => track.id)).toContain("t-3");
    expect(next.rejectedTrackIds).toContain("t-3");
  });

  it("removes a rejected MMS track while preserving the rejection", () => {
    const next = applyPreference(initialState, "t-1", "reject");

    expect(next.mmsTrackIds).not.toContain("t-1");
    expect(next.rejectedTrackIds).toContain("t-1");
  });

  it("adds an accepted track to MMS only once", () => {
    const once = applyPreference(initialState, "t-2", "accept");
    const twice = applyPreference(once, "t-2", "accept");

    expect(twice.mmsTrackIds.filter((trackId) => trackId === "t-2")).toHaveLength(1);
  });

  describe("buildEmbeddingText", () => {
    const vocabulary = [
      "jazz",
      "bebop",
      "cool jazz",
      "hard bop",
      "vocal jazz",
      "piano jazz",
    ];

    const track = (overrides: Partial<Track> = {}): Track => ({
      album: "Discovery",
      artist: "Daft Punk",
      artworkClass: "from-violet-700 via-fuchsia-600 to-slate-900",
      artworkUrl: "https://cover.test/one-more-time.jpg",
      id: "t-1",
      title: "One More Time",
      ...overrides,
    });

    it("appends genres in vote order when a track has curated genres", () => {
      const text = buildEmbeddingText(
        track({ genres: ["jazz", "bebop"], tags: ["piano jazz", "canadian"] }),
        vocabulary,
      );

      expect(text).toBe("One More Time | Daft Punk | Discovery | jazz, bebop");
    });

    it("keeps genre order untouched so the most voted genre leads the input", () => {
      const text = buildEmbeddingText(
        track({ genres: ["cool jazz", "jazz"] }),
        vocabulary,
      );

      expect(text.endsWith("cool jazz, jazz")).toBe(true);
    });

    it("ignores curated genres entirely when they are blank", () => {
      const text = buildEmbeddingText(
        track({ genres: ["  ", ""], tags: ["piano jazz"] }),
        vocabulary,
      );

      expect(text).toBe("One More Time | Daft Punk | Discovery | piano jazz");
    });

    it("falls back to the first three tags that the shared vocabulary recognises", () => {
      const text = buildEmbeddingText(
        track({
          genres: [],
          tags: ["vocal jazz", "american", "2008 universal fire victim", "piano jazz", "vocalist"],
        }),
        vocabulary,
      );

      expect(text).toBe(
        "One More Time | Daft Punk | Discovery | vocal jazz, piano jazz",
      );
    });

    it("keeps every excluded noise tag out of the embedding input", () => {
      const text = buildEmbeddingText(
        track({
          genres: [],
          tags: [
            "2008 universal fire victim",
            "american",
            "canadian",
            "1960s",
            "gen z",
            "vocalist",
            "mezzo-soprano",
            "cotm candidate",
            "legends",
            "vyrzukhisuc-artiest",
          ],
        }),
        vocabulary,
      );

      expect(text).toBe("One More Time | Daft Punk | Discovery");
    });

    it("emits metadata only when no genre or recognised tag remains", () => {
      const text = buildEmbeddingText(
        track({ genres: [], tags: ["american", "1960s"] }),
        vocabulary,
      );

      expect(text).toBe("One More Time | Daft Punk | Discovery");
    });

    it("emits metadata only when genres and tags are both absent", () => {
      expect(buildEmbeddingText(track(), vocabulary)).toBe(
        "One More Time | Daft Punk | Discovery",
      );
    });

    it("skips empty metadata fields instead of leaving bare separators", () => {
      const text = buildEmbeddingText(
        track({ album: "", artist: "", genres: ["jazz"] }),
        vocabulary,
      );

      expect(text).toBe("One More Time | jazz");
    });
  });
});
