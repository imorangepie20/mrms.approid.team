import { describe, expect, it, vi } from "vitest";

import {
  claimEnrichmentJob,
  completeEnrichmentJob,
  createImport,
  disconnectTidal,
  getCachedArtistGenres,
  getMusicBrainzSlotDelay,
  getSavedPlaylistTracks,
  getSavedPlaylists,
  getSavedTracks,
  getSharedGenreVocabulary,
  upsertArtistGenres,
  upsertPlaylistPage,
  type TransactionExecutor,
} from "./music-library";

function queryExecutor(rows: unknown[] = []) {
  const query = vi.fn(async (text: string, values?: unknown[]) => {
    void text;
    void values;
    return { rows };
  });
  return {
    database: { query } as unknown as TransactionExecutor,
    query,
  };
}

describe("music library repository", () => {
  it("scopes saved playlists to the requesting Auth0 subject", async () => {
    const { database, query } = queryExecutor([]);

    await expect(
      getSavedPlaylists("auth0|listener-b", database),
    ).resolves.toEqual([]);

    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/WHERE\s+u\.auth0_subject\s*=\s*\$1/i),
      ["auth0|listener-b"],
    );
  });

  it("maps saved tracks for playback and scopes them to the requesting user", async () => {
    const { database, query } = queryExecutor([
      {
        album_name: "Discovery",
        artist_name: "Daft Punk",
        cover_art_url: "https://cover.test/one-more-time.jpg",
        duration_ms: 320_000,
        id: "track-row",
        mb_genres: ["house", "disco"],
        mb_tags: ["french"],
        tidal_artwork_url: "https://tidal.test/fallback.jpg",
        tidal_track_id: "776453",
        title: "One More Time",
      },
    ]);

    await expect(getSavedTracks("auth0|listener-a", database)).resolves.toEqual([
      {
        album: "Discovery",
        artist: "Daft Punk",
        artworkClass: "from-violet-700 via-fuchsia-600 to-slate-900",
        artworkUrl: "https://cover.test/one-more-time.jpg",
        durationSeconds: 320,
        genres: ["house", "disco"],
        id: "track-row",
        tags: ["french"],
        tidalTrackId: "776453",
        title: "One More Time",
      },
    ]);
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/WHERE\s+u\.auth0_subject\s*=\s*\$1/i),
      ["auth0|listener-a"],
    );
  });

  it("returns playlist tracks in saved position order for the requesting user", async () => {
    const { database, query } = queryExecutor([
      {
        album_name: "Discovery",
        artist_name: "Daft Punk",
        cover_art_url: null,
        duration_ms: 320_000,
        id: "track-row",
        playlist_id: "playlist-row",
        position: 7,
        tidal_artwork_url: "https://tidal.test/one-more-time.jpg",
        tidal_track_id: "776453",
        title: "One More Time",
      },
    ]);

    await expect(
      getSavedPlaylistTracks("auth0|listener-a", database),
    ).resolves.toEqual([
      {
        playlistId: "playlist-row",
        position: 7,
        track: {
          album: "Discovery",
          artist: "Daft Punk",
          artworkClass: "from-violet-700 via-fuchsia-600 to-slate-900",
          artworkUrl: "https://tidal.test/one-more-time.jpg",
          durationSeconds: 320,
          id: "track-row",
          tidalTrackId: "776453",
          title: "One More Time",
        },
      },
    ]);
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/WHERE\s+u\.auth0_subject\s*=\s*\$1[\s\S]*ORDER BY\s+pt\.playlist_id,\s*pt\.position/i),
      ["auth0|listener-a"],
    );
  });

  it("preserves duplicate tracks by upserting each playlist position", async () => {
    const query = vi.fn(async (text: string, values?: unknown[]) => {
      void values;
      if (text.includes("INSERT INTO user_playlists")) {
        return { rows: [{ id: "playlist-row" }] };
      }
      if (text.includes("INSERT INTO music_tracks")) {
        return { rows: [{ id: "track-row" }] };
      }
      return { rows: [] };
    });
    const database = { query } as unknown as TransactionExecutor;

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

    const relationshipCalls = query.mock.calls.filter(([sql]) =>
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
    const { database, query } = queryExecutor([
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
    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/WHERE\s+auth0_subject\s*=\s*\$1/i),
      ["auth0|listener-a", ["playlist-a"]],
    );
  });

  it("claims one due enrichment job with a lock scoped to the user", async () => {
    const { database, query } = queryExecutor([]);

    await expect(
      claimEnrichmentJob("auth0|listener-a", database),
    ).resolves.toBeNull();

    const sql = query.mock.calls[0]?.[0] ?? "";
    expect(sql).toMatch(/auth0_subject\s*=\s*\$1/i);
    expect(sql).toMatch(/FOR UPDATE(?: OF j)? SKIP LOCKED/i);
  });

  it("clears tokens and pauses TIDAL imports without deleting saved music", async () => {
    const query = vi.fn(async (text: string, values?: unknown[]) => {
      void values;
      if (text.includes("playlist_count")) {
        return { rows: [{ playlist_count: 3, track_count: 80 }] };
      }
      return { rows: [] };
    });
    const database = { query } as unknown as TransactionExecutor;

    await expect(disconnectTidal("auth0|listener-a", database)).resolves.toEqual({
      playlistCount: 3,
      status: "disconnected",
      trackCount: 80,
    });

    const sql = query.mock.calls.map(([text]) => text).join("\n");
    expect(sql).toMatch(/encrypted_access_token\s*=\s*NULL/i);
    expect(sql).toMatch(/encrypted_refresh_token\s*=\s*NULL/i);
    expect(sql).toMatch(/status\s*=\s*'paused'/i);
    expect(sql).not.toMatch(/DELETE FROM (user_playlists|music_tracks)/i);
  });

  it("persists genres and tags alongside the enrichment decision", async () => {
    const query = vi.fn(async (text: string, values?: unknown[]) => {
      void text;
      void values;
      return { rows: [{ track_id: "track-row" }] };
    });
    const database = { query } as unknown as TransactionExecutor;

    await expect(
      completeEnrichmentJob(
        "auth0|listener-a",
        "track-row",
        {
          coverArtUrl: null,
          genres: ["jazz", "bebop"],
          recordingId: "recording-a",
          releaseGroupId: null,
          releaseId: null,
          status: "matched",
          tags: ["piano jazz"],
        },
        database,
      ),
    ).resolves.toBe(true);

    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/mb_genres\s*=\s*\$8/i),
      [
        "auth0|listener-a",
        "track-row",
        "recording-a",
        null,
        null,
        "matched",
        null,
        ["jazz", "bebop"],
        ["piano jazz"],
      ],
    );
  });

  it("reads cached artist genres by MBID", async () => {
    const { database, query } = queryExecutor([
      { genres: ["jazz"], tags: ["piano jazz"] },
    ]);

    await expect(
      getCachedArtistGenres(
        "ed801bdd-f057-41c0-94fb-76cb5676cd59",
        database,
      ),
    ).resolves.toEqual({ genres: ["jazz"], tags: ["piano jazz"] });

    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/FROM musicbrainz_artists WHERE mbid = \$1/i),
      ["ed801bdd-f057-41c0-94fb-76cb5676cd59"],
    );
  });

  it("returns null when an artist is not yet cached", async () => {
    const { database } = queryExecutor([]);

    await expect(
      getCachedArtistGenres(
        "ed801bdd-f057-41c0-94fb-76cb5676cd59",
        database,
      ),
    ).resolves.toBeNull();
  });

  it("upserts artist genres into the shared cache", async () => {
    const { database, query } = queryExecutor();

    await upsertArtistGenres(
      "ed801bdd-f057-41c0-94fb-76cb5676cd59",
      "Oscar Peterson",
      ["jazz", "bebop"],
      ["piano jazz"],
      database,
    );

    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/INSERT INTO musicbrainz_artists[\s\S]*ON CONFLICT \(mbid\)/i),
      [
        "ed801bdd-f057-41c0-94fb-76cb5676cd59",
        "Oscar Peterson",
        ["jazz", "bebop"],
        ["piano jazz"],
      ],
    );
  });

  it("reports how long until the MusicBrainz rate limit slot frees", async () => {
    const { database, query } = queryExecutor([{ delay_ms: 850 }]);

    await expect(getMusicBrainzSlotDelay(database)).resolves.toBe(850);

    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(/FROM musicbrainz_rate_limits\s+WHERE service = 'musicbrainz'/i),
    );
  });

  it("assumes the slot is free when no rate limit row exists", async () => {
    const { database } = queryExecutor([]);

    await expect(getMusicBrainzSlotDelay(database)).resolves.toBe(0);
  });

  it("asks the shared cache for the distinct genre vocabulary", async () => {
    const { database, query } = queryExecutor([
      { genre: "jazz" },
      { genre: "vocal jazz" },
    ]);

    await expect(
      getSharedGenreVocabulary(database),
    ).resolves.toEqual(["jazz", "vocal jazz"]);

    expect(query).toHaveBeenCalledWith(
      expect.stringMatching(
        /SELECT DISTINCT genre[\s\S]*unnest\(genres\)[\s\S]*FROM musicbrainz_artists[\s\S]*WHERE genre <> ''[\s\S]*ORDER BY genre/i,
      ),
    );
  });
});
