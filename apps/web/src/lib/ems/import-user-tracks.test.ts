import { describe, expect, it, vi } from "vitest";

import { stageImportedTidalTracks } from "./import-user-tracks";

describe("EMS user import staging", () => {
  it("stages verified TIDAL IDs without copying the user's identity or private metadata", async () => {
    const query = vi.fn(async (sql: string) => sql.includes("RETURNING id") ? { rows: [{ id: "run-a" }] } : { rows: [] });
    await stageImportedTidalTracks("auth0|private-user", [{
      addedAt: null,
      position: 0,
      track: { albumName: "Discovery", artistName: "Daft Punk", durationMs: 31000, isrc: "ISRC-A", tidalAlbumId: "album-a", tidalArtworkUrl: null, tidalTrackId: "tidal-a", title: "One More Time" },
    }], { query });

    const calls = query.mock.calls;
    expect(calls.some(([sql]) => sql.includes("user_import"))).toBe(true);
    expect(calls.some(([, values]) => values?.includes("auth0|private-user"))).toBe(false);
    expect(calls.some(([sql, values]) => sql.includes("ems_ingest_candidates") && values?.includes("tidal-a"))).toBe(true);
  });
});
