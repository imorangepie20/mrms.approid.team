import { describe, expect, it, vi } from "vitest";

import {
  claimEnrichmentJob,
  createImport,
  getSavedPlaylists,
  upsertPlaylistPage,
  type TransactionExecutor,
} from "./music-library";

function queryExecutor(rows: unknown[] = []) {
  return {
    query: vi.fn().mockResolvedValue({ rows }),
  } satisfies TransactionExecutor;
}

describe("music library repository", () => {
  it("scopes saved playlists to the requesting Auth0 subject", async () => {
    const database = queryExecutor([]);

    await expect(
      getSavedPlaylists("auth0|listener-b", database),
    ).resolves.toEqual([]);

    expect(database.query).toHaveBeenCalledWith(
      expect.stringMatching(/WHERE\s+u\.auth0_subject\s*=\s*\$1/i),
      ["auth0|listener-b"],
    );
  });

  it("preserves duplicate tracks by upserting each playlist position", async () => {
    const database = {
      query: vi.fn(async (text: string) => {
        if (text.includes("INSERT INTO user_playlists")) {
          return { rows: [{ id: "playlist-row" }] };
        }
        if (text.includes("INSERT INTO music_tracks")) {
          return { rows: [{ id: "track-row" }] };
        }
        return { rows: [] };
      }),
    } satisfies TransactionExecutor;

    const result = await upsertPlaylistPage(
      {
        auth0Subject: "auth0|listener-a",
        playlist: {
          description: null,
          name: "Repeated favorites",
          tidalArtworkUrl: null,
          tidalPlaylistId: "playlist:opaque",
        },
        tracks: [1, 2].map((position) => ({
          addedAt: null,
          position,
          track: {
            albumName: "Album",
            artistName: "Artist",
            durationMs: 180_000,
            isrc: "USABC2300001",
            tidalAlbumId: "album:opaque",
            tidalArtworkUrl: null,
            tidalTrackId: "track:opaque",
            title: "Again",
          },
        })),
      },
      database,
    );

    const relationshipCalls = database.query.mock.calls.filter(([sql]) =>
      sql.includes("INSERT INTO user_playlist_tracks"),
    );
    expect(relationshipCalls).toHaveLength(2);
    expect(relationshipCalls.map(([, values]) => values?.[1])).toEqual([1, 2]);
    expect(relationshipCalls[0]?.[0]).toMatch(
      /ON CONFLICT \(playlist_id, position\)/,
    );
    expect(result).toEqual({ playlistId: "playlist-row", trackCount: 2 });
  });

  it("creates imports only through the user selected by Auth0 subject", async () => {
    const database = queryExecutor([
      {
        id: "import-row",
        requested_playlist_ids: ["playlist-a"],
        status: "pending",
      },
    ]);

    const result = await createImport(
      "auth0|listener-a",
      ["playlist-a"],
      database,
    );

    expect(result.id).toBe("import-row");
    expect(database.query).toHaveBeenCalledWith(
      expect.stringMatching(/WHERE\s+auth0_subject\s*=\s*\$1/i),
      ["auth0|listener-a", ["playlist-a"]],
    );
  });

  it("claims one due enrichment job with a lock scoped to the user", async () => {
    const database = queryExecutor([]);

    await expect(
      claimEnrichmentJob("auth0|listener-a", database),
    ).resolves.toBeNull();

    const sql = database.query.mock.calls[0]?.[0] ?? "";
    expect(sql).toMatch(/auth0_subject\s*=\s*\$1/i);
    expect(sql).toMatch(/FOR UPDATE(?: OF j)? SKIP LOCKED/i);
  });
});
