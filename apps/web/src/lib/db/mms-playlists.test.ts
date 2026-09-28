import { describe, expect, it, vi } from "vitest";

import {
  addMmsPlaylistTrack,
  createMmsPlaylist,
  deleteMmsPlaylist,
  deleteMmsPlaylistTrack,
  getMmsPlaylist,
  getMmsPlaylists,
  getMmsPlaylistsForTrack,
  MmsPlaylistRepositoryError,
  reorderMmsPlaylistTracks,
  updateMmsPlaylist,
} from "./mms-playlists";

const summaryRow = {
  created_at: new Date("2026-09-28T00:00:00.000Z"),
  description: "밤에 듣는 곡",
  id: "11111111-1111-4111-8111-111111111111",
  name: "밤 산책",
  track_count: 2,
  updated_at: new Date("2026-09-28T01:00:00.000Z"),
};

const trackRow = {
  album: "Homogenic",
  artist: "Björk",
  artwork_url: "https://resources.tidal.com/cover.jpg",
  created_at: new Date("2026-09-28T00:10:00.000Z"),
  duration_seconds: 300,
  id: "22222222-2222-4222-8222-222222222222",
  playback_available: true,
  position: 0,
  source: "tidal",
  source_id: "42",
  tidal_track_id: "42",
  title: "Jóga",
  track_key: "tidal:42",
};

describe("MMS playlist repository", () => {
  it("lists only playlists owned by the Auth0 subject", async () => {
    const database = { query: vi.fn().mockResolvedValue({ rows: [summaryRow] }) };

    await expect(getMmsPlaylists("auth0|listener-a", database)).resolves.toEqual([{
      createdAt: "2026-09-28T00:00:00.000Z",
      description: "밤에 듣는 곡",
      id: summaryRow.id,
      name: "밤 산책",
      trackCount: 2,
      updatedAt: "2026-09-28T01:00:00.000Z",
    }]);
    expect(database.query).toHaveBeenCalledWith(
      expect.stringMatching(/u\.auth0_subject = \$1/),
      ["auth0|listener-a"],
    );
  });

  it("marks playlists that already contain a canonical track key", async () => {
    const database = {
      query: vi.fn().mockResolvedValue({ rows: [{ ...summaryRow, contains_track: true }] }),
    };

    await expect(getMmsPlaylistsForTrack(
      "auth0|listener-a",
      "tidal:42",
      database,
    )).resolves.toEqual([expect.objectContaining({ containsTrack: true })]);
    expect(database.query).toHaveBeenCalledWith(
      expect.stringMatching(/bool_or\(t\.track_key = \$2\)/),
      ["auth0|listener-a", "tidal:42"],
    );
  });

  it("creates a playlist after ensuring the authenticated user row", async () => {
    const database = { query: vi.fn().mockResolvedValue({ rows: [summaryRow] }) };

    await createMmsPlaylist("auth0|listener-a", {
      description: "밤에 듣는 곡",
      name: "밤 산책",
    }, database);

    expect(database.query.mock.calls[0][0]).toMatch(/INSERT INTO app_users[\s\S]*INSERT INTO mms_playlists/);
    expect(database.query.mock.calls[0][1]).toEqual([
      "auth0|listener-a",
      "밤 산책",
      "밤에 듣는 곡",
    ]);
  });

  it("returns a playlist detail with ordered playable track snapshots", async () => {
    const database = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [summaryRow] })
        .mockResolvedValueOnce({ rows: [trackRow] }),
    };

    await expect(getMmsPlaylist("auth0|listener-a", summaryRow.id, database)).resolves.toMatchObject({
      id: summaryRow.id,
      tracks: [{
        id: trackRow.id,
        position: 0,
        track: { id: `mms-playlist-track:${trackRow.id}`, tidalTrackId: "42", title: "Jóga" },
      }],
    });
    expect(database.query.mock.calls[1][0]).toMatch(/ORDER BY t\.position/);
  });

  it("updates and deletes only a playlist owned by the subject", async () => {
    const updateDatabase = { query: vi.fn().mockResolvedValue({ rows: [summaryRow] }) };
    await updateMmsPlaylist("auth0|listener-a", summaryRow.id, { name: "새 이름" }, updateDatabase);
    expect(updateDatabase.query.mock.calls[0][0]).toMatch(/u\.auth0_subject = \$1/);

    const deleteDatabase = { query: vi.fn().mockResolvedValue({ rows: [{ id: summaryRow.id }] }) };
    await expect(deleteMmsPlaylist("auth0|listener-a", summaryRow.id, deleteDatabase)).resolves.toBe(true);
    expect(deleteDatabase.query.mock.calls[0][0]).toMatch(/DELETE FROM mms_playlists[\s\S]*u\.auth0_subject = \$1/);
  });

  it("locks the owned playlist and appends a canonical track", async () => {
    const database = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ id: summaryRow.id }] })
        .mockResolvedValueOnce({ rows: [trackRow] })
        .mockResolvedValueOnce({ rows: [] }),
    };

    const item = await addMmsPlaylistTrack("auth0|listener-a", summaryRow.id, {
      album: trackRow.album,
      artist: trackRow.artist,
      artworkUrl: trackRow.artwork_url,
      durationSeconds: trackRow.duration_seconds,
      playbackAvailable: true,
      source: "tidal",
      sourceId: "42",
      tidalTrackId: "42",
      title: trackRow.title,
      trackKey: "tidal:42",
    }, database);

    expect(item.trackKey).toBe("tidal:42");
    expect(database.query.mock.calls[0][0]).toMatch(/FOR UPDATE OF p/);
    expect(database.query.mock.calls[1][0]).toMatch(/COALESCE\(max\(position\), -1\) \+ 1/);
  });

  it("reports duplicate additions without exposing a database error", async () => {
    const duplicate = Object.assign(new Error("duplicate"), { code: "23505" });
    const database = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ id: summaryRow.id }] })
        .mockRejectedValueOnce(duplicate),
    };

    await expect(addMmsPlaylistTrack("auth0|listener-a", summaryRow.id, {
      album: trackRow.album,
      artist: trackRow.artist,
      artworkUrl: "",
      durationSeconds: null,
      playbackAvailable: true,
      source: "tidal",
      sourceId: "42",
      tidalTrackId: "42",
      title: trackRow.title,
      trackKey: "tidal:42",
    }, database)).rejects.toMatchObject({ code: "playlist_track_already_exists" });
  });

  it("removes an owned item and compacts positions in the same transaction", async () => {
    const database = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ id: summaryRow.id }] })
        .mockResolvedValueOnce({ rows: [{ id: trackRow.id }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
    };

    await expect(deleteMmsPlaylistTrack(
      "auth0|listener-a",
      summaryRow.id,
      trackRow.id,
      database,
    )).resolves.toBe(true);

    expect(database.query.mock.calls[2][0]).toMatch(/SET CONSTRAINTS mms_playlist_tracks_position_unique DEFERRED/);
    expect(database.query.mock.calls[3][0]).toMatch(/row_number\(\) OVER \(ORDER BY position[^)]*\)/i);
  });

  it("reorders only when the complete owned item set is supplied", async () => {
    const first = "22222222-2222-4222-8222-222222222222";
    const second = "33333333-3333-4333-8333-333333333333";
    const database = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ id: summaryRow.id }] })
        .mockResolvedValueOnce({ rows: [{ id: first }, { id: second }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
    };

    await reorderMmsPlaylistTracks("auth0|listener-a", summaryRow.id, [second, first], database);
    expect(database.query.mock.calls[3][0]).toMatch(/unnest\(\$2::uuid\[\]\) WITH ORDINALITY/);

    const invalidDatabase = {
      query: vi.fn()
        .mockResolvedValueOnce({ rows: [{ id: summaryRow.id }] })
        .mockResolvedValueOnce({ rows: [{ id: first }, { id: second }] }),
    };
    await expect(reorderMmsPlaylistTracks(
      "auth0|listener-a",
      summaryRow.id,
      [first],
      invalidDatabase,
    )).rejects.toBeInstanceOf(MmsPlaylistRepositoryError);
  });
});
