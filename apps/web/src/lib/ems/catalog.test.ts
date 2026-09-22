import { describe, expect, it, vi } from "vitest";

import {
  decodeEmsCursor,
  encodeEmsCursor,
  listEmsTracks,
} from "./catalog";

describe("EMS catalog", () => {
  it("rejects a tampered cursor and filter mismatch", () => {
    process.env.EMS_CURSOR_SECRET = "test-secret";
    const cursor = encodeEmsCursor({ offset: 24, filterHash: "abc", expiresAt: Date.now() + 60_000 });
    expect(() => decodeEmsCursor(`${cursor}x`, "abc")).toThrow("ems_cursor_invalid");
    expect(() => decodeEmsCursor(cursor, "different")).toThrow("ems_cursor_invalid");
  });

  it("clamps page size and maps only active Korean playable embeddings", async () => {
    process.env.EMS_CURSOR_SECRET = "test-secret";
    const query = vi.fn(async () => ({ rows: [{
      id: "track-a", tidal_id: "tidal-a", title: "One More Time", artist: "Daft Punk", album: "Discovery", duration_ms: 310000,
      artwork_url: null,
    }] }));
    const result = await listEmsTracks({ limit: 999, region: "KR", sort: "new" }, { query } as never);

    expect(result.tracks[0]).toMatchObject({ id: "track-a", tidalTrackId: "tidal-a", title: "One More Time" });
    expect(query).toHaveBeenCalledWith(expect.stringMatching(/status = 'active'/i), expect.arrayContaining([100]));
  });
});
