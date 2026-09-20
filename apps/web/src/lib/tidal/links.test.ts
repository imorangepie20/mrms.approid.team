import { describe, expect, it } from "vitest";

import { tidalBrowseUrl, tidalEmbedUrl } from "./links";

describe("TIDAL links", () => {
  it("encodes resource ids in official embed links", () => {
    expect(tidalEmbedUrl("track", "track/1")).toBe(
      "https://embed.tidal.com/tracks/track%2F1",
    );
  });

  it("encodes resource ids in official browse links", () => {
    expect(tidalBrowseUrl("playlist", "list 1")).toBe(
      "https://tidal.com/browse/playlist/list%201",
    );
  });
});
