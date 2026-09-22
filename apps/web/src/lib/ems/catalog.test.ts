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

  it("clamps page size and maps active tracks using only latest Korean availability", async () => {
    process.env.EMS_CURSOR_SECRET = "test-secret";
    const query = vi.fn(async (sql: string, values?: unknown[]) => {
      void sql;
      void values;
      return { rows: [{
        id: "track-a", tidal_id: "tidal-a", title: "One More Time", artist: "Daft Punk", album: "Discovery", duration_ms: 310000,
        artwork_url: "https://resources.tidal.com/cover.jpg",
      }] };
    });
    const result = await listEmsTracks({ limit: 999, region: "KR", sort: "new" }, { query } as never);

    expect(result.tracks[0]).toMatchObject({ id: "track-a", tidalTrackId: "tidal-a", title: "One More Time", artworkUrl: "https://resources.tidal.com/cover.jpg" });
    expect(query).toHaveBeenCalledWith(expect.stringMatching(/status = 'active'/i), expect.arrayContaining([100]));
    const sql = query.mock.calls[0]?.[0] ?? "";
    expect(sql).not.toContain("ems_track_embeddings");
    expect(sql).toMatch(/e\.artwork_url/i);
    expect(sql).toMatch(/ORDER BY a\.observed_at DESC[\s\S]*LIMIT 1/i);
  });
});
