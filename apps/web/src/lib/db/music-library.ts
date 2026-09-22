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

type SavedTrackRow = {
  album_name: string;
  artist_name: string;
  cover_art_url: string | null;
  duration_ms: number | null;
  id: string;
  mb_genres: string[] | null;
  mb_tags: string[] | null;
  tidal_artwork_url: string | null;
  tidal_track_id: string;
  title: string;
};

type SavedPlaylistTrackRow = SavedTrackRow & {
  playlist_id: string;
  position: number;
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
  unique_track_count?: number;
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

export async function getSavedTracks(
  auth0Subject: string,
  executor?: TransactionExecutor,
) {
  const database = executor ?? getDatabasePool();
  const result = await database.query<SavedTrackRow>(
    `SELECT
       t.id,
       t.tidal_track_id,
       t.title,
       t.artist_name,
       t.album_name,
       t.duration_ms,
       t.tidal_artwork_url,
       t.cover_art_url,
       t.mb_genres,
       t.mb_tags
     FROM music_tracks AS t
     INNER JOIN app_users AS u ON u.id = t.user_id
     WHERE u.auth0_subject = $1
     ORDER BY t.created_at, t.id`,
    [auth0Subject],
  );

  return result.rows.map((row) => ({
    album: row.album_name,
    artist: row.artist_name,
    artworkClass: "from-violet-700 via-fuchsia-600 to-slate-900",
    artworkUrl: row.cover_art_url ?? row.tidal_artwork_url ?? "",
    durationSeconds:
      row.duration_ms === null ? null : Math.round(row.duration_ms / 1000),
    genres: row.mb_genres ?? [],
    id: row.id,
    tags: row.mb_tags ?? [],
    tidalTrackId: row.tidal_track_id,
    title: row.title,
  }));
}

export async function getSavedPlaylistTracks(
  auth0Subject: string,
  executor?: TransactionExecutor,
) {
  const database = executor ?? getDatabasePool();
  const result = await database.query<SavedPlaylistTrackRow>(
    `SELECT
       pt.playlist_id,
       pt.position,
       t.id,
       t.tidal_track_id,
       t.title,
       t.artist_name,
       t.album_name,
       t.duration_ms,
       t.tidal_artwork_url,
       t.cover_art_url
     FROM user_playlist_tracks AS pt
     INNER JOIN user_playlists AS p ON p.id = pt.playlist_id
     INNER JOIN app_users AS u ON u.id = p.user_id
     INNER JOIN music_tracks AS t ON t.id = pt.track_id AND t.user_id = u.id
     WHERE u.auth0_subject = $1
     ORDER BY pt.playlist_id, pt.position`,
    [auth0Subject],
  );

  return result.rows.map((row) => ({
    playlistId: row.playlist_id,
    position: row.position,
    track: {
      album: row.album_name,
      artist: row.artist_name,
      artworkClass: "from-violet-700 via-fuchsia-600 to-slate-900",
      artworkUrl: row.cover_art_url ?? row.tidal_artwork_url ?? "",
      durationSeconds:
        row.duration_ms === null ? null : Math.round(row.duration_ms / 1000),
      id: row.id,
      tidalTrackId: row.tidal_track_id,
      title: row.title,
    },
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

export async function findActiveImport(
  auth0Subject: string,
  requestedPlaylistIds: string[],
  executor?: TransactionExecutor,
) {
  const database = executor ?? getDatabasePool();
  const result = await database.query<PlaylistImportRow>(
    `SELECT i.id, i.requested_playlist_ids, i.status
     FROM playlist_imports AS i
     INNER JOIN app_users AS u ON u.id = i.user_id
     WHERE u.auth0_subject = $1
       AND i.requested_playlist_ids = $2
       AND i.status IN ('pending', 'running')
     ORDER BY i.created_at DESC
     LIMIT 1`,
    [auth0Subject, requestedPlaylistIds],
  );
  return result.rows[0] ?? null;
}

export async function getPlaylistImportById(
  auth0Subject: string,
  importId: string,
  executor?: TransactionExecutor,
) {
  const database = executor ?? getDatabasePool();
  const result = await database.query<PlaylistImportRow & { enrichment_pending_count: number }>(
    `SELECT
       i.id,
       i.requested_playlist_ids,
       i.status,
       i.saved_playlist_count,
       i.saved_track_count,
       i.error_code,
       i.started_at,
       i.completed_at,
       (
         SELECT count(*)::integer
         FROM music_tracks AS saved_track
         WHERE saved_track.user_id = i.user_id
       ) AS unique_track_count,
       (
         SELECT count(*)::integer
         FROM musicbrainz_enrichment_jobs AS j
         INNER JOIN music_tracks AS t ON t.id = j.track_id
         WHERE t.user_id = i.user_id AND j.status IN ('pending', 'running')
       ) AS enrichment_pending_count
     FROM playlist_imports AS i
     INNER JOIN app_users AS u ON u.id = i.user_id
     WHERE u.auth0_subject = $1 AND i.id = $2`,
    [auth0Subject, importId],
  );
  const row = result.rows[0];
  return row
    ? {
        completedAt: row.completed_at ?? null,
        enrichmentPendingCount: row.enrichment_pending_count,
        errorCode: row.error_code ?? null,
        id: row.id,
        playlistIds: row.requested_playlist_ids,
        savedPlaylistCount: row.saved_playlist_count ?? 0,
        savedTrackCount: row.saved_track_count ?? 0,
        startedAt: row.started_at ?? null,
        status: row.status,
        uniqueTrackCount: row.unique_track_count ?? 0,
      }
    : null;
}

export async function reserveMusicBrainzRequest(
  executor?: TransactionExecutor,
) {
  return inTransaction(executor, async (transaction) => {
    const result = await transaction.query<{ reserved: boolean }>(
      `WITH rate_lock AS MATERIALIZED (
         SELECT pg_advisory_xact_lock(hashtext('musicbrainz-rate-limit'))
       ), reserved AS (
         UPDATE musicbrainz_rate_limits AS r
         SET next_request_at = now() + interval '1 second'
         FROM rate_lock
         WHERE r.service = 'musicbrainz' AND r.next_request_at <= now()
         RETURNING true AS reserved
       )
       SELECT reserved FROM reserved`,
    );
    return result.rows[0]?.reserved ?? false;
  });
}

export async function getMusicBrainzSlotDelay(
  executor?: TransactionExecutor,
): Promise<number> {
  const database = executor ?? getDatabasePool();
  const result = await database.query<{ delay_ms: number }>(
    `SELECT CASE
              WHEN next_request_at > now()
              THEN CEIL(EXTRACT(EPOCH FROM (next_request_at - now())) * 1000)::integer
              ELSE 0
            END AS delay_ms
     FROM musicbrainz_rate_limits
     WHERE service = 'musicbrainz'`,
  );
  return result.rows[0]?.delay_ms ?? 0;
}

export async function completeEnrichmentJob(
  auth0Subject: string,
  trackId: string,
  decision: {
    coverArtUrl: string | null;
    genres: string[];
    recordingId: string | null;
    releaseGroupId: string | null;
    releaseId: string | null;
    status: "not_found" | "matched" | "ambiguous";
    tags: string[];
  },
  executor?: TransactionExecutor,
) {
  return inTransaction(executor, async (transaction) => {
    const result = await transaction.query<{ track_id: string }>(
      `WITH updated_track AS (
         UPDATE music_tracks AS t
         SET mb_recording_id = $3,
             mb_release_id = $4,
             mb_release_group_id = $5,
             mb_status = $6,
             cover_art_url = $7,
             mb_genres = $8,
             mb_tags = $9,
             updated_at = now()
         FROM app_users AS u
         WHERE u.auth0_subject = $1 AND t.user_id = u.id AND t.id = $2
         RETURNING t.id
       )
       UPDATE musicbrainz_enrichment_jobs AS j
       SET status = 'completed', last_error_code = NULL, updated_at = now()
       FROM updated_track AS t
       WHERE j.track_id = t.id
       RETURNING j.track_id`,
      [
        auth0Subject,
        trackId,
        decision.recordingId,
        decision.releaseId,
        decision.releaseGroupId,
        decision.status,
        decision.coverArtUrl,
        decision.genres,
        decision.tags,
      ],
    );
    return result.rows.length === 1;
  });
}

export type CachedArtistGenres = {
  genres: string[];
  tags: string[];
};

export async function getCachedArtistGenres(
  mbid: string,
  executor?: TransactionExecutor,
): Promise<CachedArtistGenres | null> {
  const database = executor ?? getDatabasePool();
  const result = await database.query<CachedArtistGenres>(
    `SELECT genres, tags FROM musicbrainz_artists WHERE mbid = $1`,
    [mbid],
  );
  return result.rows[0] ?? null;
}

export async function upsertArtistGenres(
  mbid: string,
  name: string,
  genres: string[],
  tags: string[],
  executor?: TransactionExecutor,
): Promise<void> {
  const database = executor ?? getDatabasePool();
  await database.query(
    `INSERT INTO musicbrainz_artists (mbid, name, genres, tags, fetched_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (mbid) DO UPDATE
     SET name = EXCLUDED.name,
         genres = EXCLUDED.genres,
         tags = EXCLUDED.tags,
         fetched_at = now()`,
    [mbid, name, genres, tags],
  );
}

export async function getSharedGenreVocabulary(
  executor?: TransactionExecutor,
): Promise<string[]> {
  const database = executor ?? getDatabasePool();
  const result = await database.query<{ genre: string }>(
    `SELECT DISTINCT genre
     FROM (
       SELECT unnest(genres) AS genre FROM musicbrainz_artists
     ) AS flattened
     WHERE genre <> ''
     ORDER BY genre`,
  );
  return result.rows.map((row) => row.genre);
}


export async function releaseEnrichmentJob(
  auth0Subject: string,
  trackId: string,
  executor?: TransactionExecutor,
) {
  const database = executor ?? getDatabasePool();
  await database.query(
    `UPDATE musicbrainz_enrichment_jobs AS j
     SET status = 'pending',
         attempt_count = GREATEST(j.attempt_count - 1, 0),
         updated_at = now()
     FROM music_tracks AS t
     INNER JOIN app_users AS u ON u.id = t.user_id
     WHERE u.auth0_subject = $1 AND t.id = $2 AND j.track_id = t.id`,
    [auth0Subject, trackId],
  );
}

export async function retryEnrichmentJob(
  auth0Subject: string,
  trackId: string,
  attemptCount: number,
  errorCode: string,
  executor?: TransactionExecutor,
) {
  const database = executor ?? getDatabasePool();
  const retrySeconds = Math.min(2 ** Math.max(attemptCount - 1, 0), 60);
  await database.query(
    `UPDATE musicbrainz_enrichment_jobs AS j
     SET status = CASE WHEN $3 >= 5 THEN 'failed' ELSE 'pending' END,
         next_attempt_at = now() + $5 * interval '1 second',
         last_error_code = $4,
         updated_at = now()
     FROM music_tracks AS t
     INNER JOIN app_users AS u ON u.id = t.user_id
     WHERE u.auth0_subject = $1 AND t.id = $2 AND j.track_id = t.id`,
    [auth0Subject, trackId, attemptCount, errorCode, retrySeconds],
  );
}

export async function countRemainingEnrichmentJobs(
  auth0Subject: string,
  executor?: TransactionExecutor,
) {
  const database = executor ?? getDatabasePool();
  const result = await database.query<{ count: number }>(
    `SELECT count(*)::integer AS count
     FROM musicbrainz_enrichment_jobs AS j
     INNER JOIN music_tracks AS t ON t.id = j.track_id
     INNER JOIN app_users AS u ON u.id = t.user_id
     WHERE u.auth0_subject = $1 AND j.status IN ('pending', 'running')`,
    [auth0Subject],
  );
  return result.rows[0]?.count ?? 0;
}

export async function disconnectTidal(
  auth0Subject: string,
  executor?: TransactionExecutor,
) {
  return inTransaction(executor, async (transaction) => {
    await transaction.query(
      `UPDATE tidal_connections AS connection
       SET status = 'disconnected',
           encrypted_access_token = NULL,
           encrypted_refresh_token = NULL,
           access_token_expires_at = NULL,
           scope = NULL,
           disconnected_at = now(),
           updated_at = now()
       FROM app_users AS app_user
       WHERE app_user.auth0_subject = $1
         AND connection.user_id = app_user.id`,
      [auth0Subject],
    );

    await transaction.query(
      `UPDATE playlist_imports AS i
       SET status = 'paused', updated_at = now()
       FROM app_users AS app_user
       WHERE app_user.auth0_subject = $1
         AND i.user_id = app_user.id
         AND i.status IN ('pending', 'running')`,
      [auth0Subject],
    );

    const counts = await transaction.query<{
      playlist_count: number;
      track_count: number;
    }>(
      `SELECT
         (SELECT count(*)::integer
          FROM user_playlists AS playlist
          WHERE playlist.user_id = app_user.id) AS playlist_count,
         (SELECT count(*)::integer
          FROM music_tracks AS track
          WHERE track.user_id = app_user.id) AS track_count
       FROM app_users AS app_user
       WHERE app_user.auth0_subject = $1`,
      [auth0Subject],
    );
    const retained = counts.rows[0];
    return {
      playlistCount: retained?.playlist_count ?? 0,
      status: "disconnected" as const,
      trackCount: retained?.track_count ?? 0,
    };
  });
}
