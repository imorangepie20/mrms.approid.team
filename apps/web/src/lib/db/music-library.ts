import { getDatabasePool } from "./pool";

import type {
  PlaylistImportStatus,
  PositionedTrack,
  TidalPlaylistSnapshot,
} from "@/lib/music/library-types";

export type TransactionExecutor = {
  query<Row extends Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Row[] }>;
};

type SavedPlaylistRow = {
  description: string | null;
  id: string;
  last_synced_at: Date | null;
  name: string;
  tidal_artwork_url: string | null;
  tidal_playlist_id: string;
};

type PlaylistImportRow = {
  completed_at?: Date | null;
  error_code?: string | null;
  id: string;
  requested_playlist_ids: string[];
  saved_playlist_count?: number;
  saved_track_count?: number;
  started_at?: Date | null;
  status: PlaylistImportStatus;
};

export type UpdateImportInput = {
  completedAt?: Date | null;
  errorCode?: string | null;
  savedPlaylistCount?: number;
  savedTrackCount?: number;
  startedAt?: Date | null;
  status?: PlaylistImportStatus;
};

async function inTransaction<T>(
  executor: TransactionExecutor | undefined,
  work: (transaction: TransactionExecutor) => Promise<T>,
) {
  if (executor) return work(executor);

  const client = await getDatabasePool().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getSavedPlaylists(
  auth0Subject: string,
  executor?: TransactionExecutor,
) {
  const database = executor ?? getDatabasePool();
  const result = await database.query<SavedPlaylistRow>(
    `SELECT
       p.id,
       p.tidal_playlist_id,
       p.name,
       p.description,
       p.tidal_artwork_url,
       p.last_synced_at
     FROM user_playlists AS p
     INNER JOIN app_users AS u ON u.id = p.user_id
     WHERE u.auth0_subject = $1
     ORDER BY p.created_at, p.id`,
    [auth0Subject],
  );

  return result.rows.map((row) => ({
    description: row.description,
    id: row.id,
    lastSyncedAt: row.last_synced_at,
    name: row.name,
    tidalArtworkUrl: row.tidal_artwork_url,
    tidalPlaylistId: row.tidal_playlist_id,
  }));
}

export async function upsertPlaylistPage(
  input: {
    auth0Subject: string;
    playlist: TidalPlaylistSnapshot;
    tracks: PositionedTrack[];
  },
  executor?: TransactionExecutor,
): Promise<{ playlistId: string; trackCount: number }> {
  return inTransaction(executor, async (transaction) => {
    const playlistResult = await transaction.query<{ id: string }>(
      `INSERT INTO user_playlists (
         user_id, tidal_playlist_id, name, description, tidal_artwork_url, last_synced_at
       )
       SELECT u.id, $2, $3, $4, $5, now()
       FROM app_users AS u
       WHERE u.auth0_subject = $1
       ON CONFLICT (user_id, tidal_playlist_id)
       DO UPDATE SET
         name = EXCLUDED.name,
         description = EXCLUDED.description,
         tidal_artwork_url = EXCLUDED.tidal_artwork_url,
         last_synced_at = EXCLUDED.last_synced_at,
         updated_at = now()
       RETURNING id`,
      [
        input.auth0Subject,
        input.playlist.tidalPlaylistId,
        input.playlist.name,
        input.playlist.description,
        input.playlist.tidalArtworkUrl,
      ],
    );
    const playlistId = playlistResult.rows[0]?.id;
    if (!playlistId) throw new Error("Music library user was not found.");

    for (const item of input.tracks) {
      const track = item.track;
      const trackResult = await transaction.query<{ id: string }>(
        `INSERT INTO music_tracks (
           user_id, tidal_track_id, isrc, title, artist_name, album_name,
           duration_ms, tidal_album_id, tidal_artwork_url, mb_status
         )
         SELECT u.id, $2, $3, $4, $5, $6, $7, $8, $9,
           CASE WHEN $3::text IS NULL THEN 'unavailable' ELSE 'pending' END
         FROM app_users AS u
         WHERE u.auth0_subject = $1
         ON CONFLICT (user_id, tidal_track_id)
         DO UPDATE SET
           isrc = EXCLUDED.isrc,
           title = EXCLUDED.title,
           artist_name = EXCLUDED.artist_name,
           album_name = EXCLUDED.album_name,
           duration_ms = EXCLUDED.duration_ms,
           tidal_album_id = EXCLUDED.tidal_album_id,
           tidal_artwork_url = EXCLUDED.tidal_artwork_url,
           mb_status = CASE
             WHEN music_tracks.mb_status = 'unavailable' AND EXCLUDED.isrc IS NOT NULL
               THEN 'pending'
             ELSE music_tracks.mb_status
           END,
           updated_at = now()
         RETURNING id`,
        [
          input.auth0Subject,
          track.tidalTrackId,
          track.isrc,
          track.title,
          track.artistName,
          track.albumName,
          track.durationMs,
          track.tidalAlbumId,
          track.tidalArtworkUrl,
        ],
      );
      const trackId = trackResult.rows[0]?.id;
      if (!trackId) throw new Error("Music library track owner was not found.");

      await transaction.query(
        `INSERT INTO user_playlist_tracks (playlist_id, position, track_id, added_at)
         SELECT p.id, $2, t.id, $5
         FROM app_users AS u
         INNER JOIN user_playlists AS p ON p.user_id = u.id AND p.id = $3
         INNER JOIN music_tracks AS t ON t.user_id = u.id AND t.id = $4
         WHERE u.auth0_subject = $1
         ON CONFLICT (playlist_id, position)
         DO UPDATE SET track_id = EXCLUDED.track_id, added_at = EXCLUDED.added_at`,
        [input.auth0Subject, item.position, playlistId, trackId, item.addedAt],
      );

      if (track.isrc) {
        await transaction.query(
          `INSERT INTO musicbrainz_enrichment_jobs (track_id, status)
           SELECT t.id, 'pending'
           FROM music_tracks AS t
           INNER JOIN app_users AS u ON u.id = t.user_id
           WHERE u.auth0_subject = $1 AND t.id = $2
           ON CONFLICT (track_id) DO NOTHING`,
          [input.auth0Subject, trackId],
        );
      }
    }

    return { playlistId, trackCount: input.tracks.length };
  });
}

export async function createImport(
  auth0Subject: string,
  requestedPlaylistIds: string[],
  executor?: TransactionExecutor,
) {
  const database = executor ?? getDatabasePool();
  const result = await database.query<PlaylistImportRow>(
    `INSERT INTO playlist_imports (user_id, requested_playlist_ids, status)
     SELECT id, $2, 'pending'
     FROM app_users
     WHERE auth0_subject = $1
     RETURNING id, requested_playlist_ids, status`,
    [auth0Subject, requestedPlaylistIds],
  );
  const row = result.rows[0];
  if (!row) throw new Error("Music library user was not found.");
  return { id: row.id, playlistIds: row.requested_playlist_ids, status: row.status };
}

export async function updateImport(
  auth0Subject: string,
  importId: string,
  update: UpdateImportInput,
  executor?: TransactionExecutor,
) {
  const database = executor ?? getDatabasePool();
  const result = await database.query<PlaylistImportRow>(
    `UPDATE playlist_imports AS i
     SET
       status = COALESCE($3, i.status),
       saved_playlist_count = COALESCE($4, i.saved_playlist_count),
       saved_track_count = COALESCE($5, i.saved_track_count),
       error_code = CASE WHEN $6::boolean THEN $7 ELSE i.error_code END,
       started_at = CASE WHEN $8::boolean THEN $9 ELSE i.started_at END,
       completed_at = CASE WHEN $10::boolean THEN $11 ELSE i.completed_at END,
       updated_at = now()
     FROM app_users AS u
     WHERE u.auth0_subject = $1 AND i.id = $2 AND i.user_id = u.id
     RETURNING i.id, i.requested_playlist_ids, i.status,
       i.saved_playlist_count, i.saved_track_count, i.error_code,
       i.started_at, i.completed_at`,
    [
      auth0Subject,
      importId,
      update.status ?? null,
      update.savedPlaylistCount ?? null,
      update.savedTrackCount ?? null,
      Object.hasOwn(update, "errorCode"),
      update.errorCode ?? null,
      Object.hasOwn(update, "startedAt"),
      update.startedAt ?? null,
      Object.hasOwn(update, "completedAt"),
      update.completedAt ?? null,
    ],
  );
  return result.rows[0] ?? null;
}

export async function claimEnrichmentJob(
  auth0Subject: string,
  executor?: TransactionExecutor,
) {
  const database = executor ?? getDatabasePool();
  const result = await database.query<{
    album_name: string;
    attempt_count: number;
    isrc: string;
    title: string;
    track_id: string;
  }>(
    `WITH candidate AS (
       SELECT j.track_id
       FROM musicbrainz_enrichment_jobs AS j
       INNER JOIN music_tracks AS t ON t.id = j.track_id
       INNER JOIN app_users AS u ON u.id = t.user_id
       WHERE u.auth0_subject = $1
         AND j.status = 'pending'
         AND j.next_attempt_at <= now()
         AND t.isrc IS NOT NULL
       ORDER BY j.next_attempt_at, j.track_id
       FOR UPDATE OF j SKIP LOCKED
       LIMIT 1
     ), claimed AS (
       UPDATE musicbrainz_enrichment_jobs AS j
       SET status = 'running', attempt_count = attempt_count + 1, updated_at = now()
       FROM candidate AS c
       WHERE j.track_id = c.track_id
       RETURNING j.track_id, j.attempt_count
     )
     SELECT c.track_id, c.attempt_count, t.isrc, t.title, t.album_name
     FROM claimed AS c
     INNER JOIN music_tracks AS t ON t.id = c.track_id`,
    [auth0Subject],
  );
  const row = result.rows[0];
  return row
    ? {
        albumName: row.album_name,
        attemptCount: row.attempt_count,
        isrc: row.isrc,
        title: row.title,
        trackId: row.track_id,
      }
    : null;
}
