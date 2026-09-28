import type {
  MmsPlaylistDetail,
  MmsPlaylistMetadata,
  MmsPlaylistPatch,
  MmsPlaylistSummary,
  MmsPlaylistTrack,
  ParsedMmsPlaylistTrack,
} from "@/lib/mms/playlists";

import { getDatabasePool } from "./pool";
import type { TransactionExecutor } from "./music-library";

type PlaylistSummaryRow = {
  contains_track?: boolean;
  created_at: Date | string;
  description: string | null;
  id: string;
  name: string;
  track_count: number;
  updated_at: Date | string;
};

type PlaylistTrackRow = {
  album: string;
  artist: string;
  artwork_url: string | null;
  created_at: Date | string;
  duration_seconds: number | null;
  id: string;
  playback_available: boolean;
  position: number;
  source: "catalog" | "tidal";
  source_id: string;
  tidal_track_id: string | null;
  title: string;
  track_key: string;
};

export class MmsPlaylistRepositoryError extends Error {
  code: string;

  constructor(code: string) {
    super(code);
    this.name = "MmsPlaylistRepositoryError";
    this.code = code;
  }
}

function database(executor?: TransactionExecutor) {
  return executor ?? getDatabasePool();
}

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

function iso(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toSummary(row: PlaylistSummaryRow): MmsPlaylistSummary {
  const summary: MmsPlaylistSummary = {
    createdAt: iso(row.created_at),
    description: row.description,
    id: row.id,
    name: row.name,
    trackCount: row.track_count,
    updatedAt: iso(row.updated_at),
  };
  if (typeof row.contains_track === "boolean") summary.containsTrack = row.contains_track;
  return summary;
}

function toTrack(row: PlaylistTrackRow): MmsPlaylistTrack {
  return {
    createdAt: iso(row.created_at),
    id: row.id,
    position: row.position,
    source: row.source,
    sourceId: row.source_id,
    track: {
      album: row.album,
      artist: row.artist,
      artworkClass: "from-violet-700 via-fuchsia-600 to-slate-900",
      artworkUrl: row.artwork_url ?? "",
      durationSeconds: row.duration_seconds,
      id: `mms-playlist-track:${row.id}`,
      playbackAvailable: row.playback_available,
      tidalTrackId: row.tidal_track_id ?? undefined,
      title: row.title,
    },
    trackKey: row.track_key,
  };
}

const summarySelect = `SELECT
  p.id,
  p.name,
  p.description,
  count(t.id)::integer AS track_count,
  p.created_at,
  p.updated_at
FROM mms_playlists AS p
INNER JOIN app_users AS u ON u.id = p.user_id
LEFT JOIN mms_playlist_tracks AS t ON t.playlist_id = p.id`;

export async function getMmsPlaylists(
  auth0Subject: string,
  executor?: TransactionExecutor,
) {
  const result = await database(executor).query<PlaylistSummaryRow>(
    `${summarySelect}
     WHERE u.auth0_subject = $1
     GROUP BY p.id
     ORDER BY p.updated_at DESC, p.id DESC`,
    [auth0Subject],
  );
  return result.rows.map(toSummary);
}

export async function getMmsPlaylistsForTrack(
  auth0Subject: string,
  trackKey: string,
  executor?: TransactionExecutor,
) {
  const result = await database(executor).query<PlaylistSummaryRow>(
    `SELECT
       p.id,
       p.name,
       p.description,
       count(t.id)::integer AS track_count,
       p.created_at,
       p.updated_at,
       coalesce(bool_or(t.track_key = $2), false) AS contains_track
     FROM mms_playlists AS p
     INNER JOIN app_users AS u ON u.id = p.user_id
     LEFT JOIN mms_playlist_tracks AS t ON t.playlist_id = p.id
     WHERE u.auth0_subject = $1
     GROUP BY p.id
     ORDER BY p.updated_at DESC, p.id DESC`,
    [auth0Subject, trackKey],
  );
  return result.rows.map(toSummary);
}

export async function getMmsPlaylist(
  auth0Subject: string,
  playlistId: string,
  executor?: TransactionExecutor,
): Promise<MmsPlaylistDetail | null> {
  const db = database(executor);
  const summary = await db.query<PlaylistSummaryRow>(
    `${summarySelect}
     WHERE u.auth0_subject = $1 AND p.id = $2
     GROUP BY p.id`,
    [auth0Subject, playlistId],
  );
  const playlist = summary.rows[0];
  if (!playlist) return null;
  const tracks = await db.query<PlaylistTrackRow>(
    `SELECT
       t.id,
       t.track_key,
       t.source,
       t.source_id,
       t.tidal_track_id,
       t.title,
       t.artist,
       t.album,
       t.artwork_url,
       t.duration_seconds,
       t.playback_available,
       t.position,
       t.created_at
     FROM mms_playlist_tracks AS t
     WHERE t.playlist_id = $1
     ORDER BY t.position, t.id`,
    [playlistId],
  );
  return { ...toSummary(playlist), tracks: tracks.rows.map(toTrack) };
}

export async function createMmsPlaylist(
  auth0Subject: string,
  input: MmsPlaylistMetadata,
  executor?: TransactionExecutor,
) {
  const result = await database(executor).query<PlaylistSummaryRow>(
    `WITH target_user AS (
       INSERT INTO app_users (auth0_subject)
       VALUES ($1)
       ON CONFLICT (auth0_subject)
       DO UPDATE SET auth0_subject = EXCLUDED.auth0_subject
       RETURNING id
     ), inserted AS (
       INSERT INTO mms_playlists (user_id, name, description)
       SELECT id, $2, $3 FROM target_user
       RETURNING *
     )
     SELECT
       id, name, description, 0::integer AS track_count, created_at, updated_at
     FROM inserted`,
    [auth0Subject, input.name, input.description],
  );
  return toSummary(result.rows[0]);
}

export async function updateMmsPlaylist(
  auth0Subject: string,
  playlistId: string,
  patch: MmsPlaylistPatch,
  executor?: TransactionExecutor,
) {
  const hasName = patch.name !== undefined;
  const hasDescription = patch.description !== undefined;
  const result = await database(executor).query<PlaylistSummaryRow>(
    `WITH updated AS (
       UPDATE mms_playlists AS p
       SET name = CASE WHEN $4::boolean THEN $2 ELSE p.name END,
           description = CASE WHEN $5::boolean THEN $3 ELSE p.description END,
           updated_at = now()
       FROM app_users AS u
       WHERE u.auth0_subject = $1
         AND p.user_id = u.id
         AND p.id = $6
       RETURNING p.*
     )
     SELECT
       updated.id,
       updated.name,
       updated.description,
       count(t.id)::integer AS track_count,
       updated.created_at,
       updated.updated_at
     FROM updated
     LEFT JOIN mms_playlist_tracks AS t ON t.playlist_id = updated.id
     GROUP BY updated.id, updated.name, updated.description, updated.created_at, updated.updated_at`,
    [
      auth0Subject,
      patch.name ?? null,
      patch.description ?? null,
      hasName,
      hasDescription,
      playlistId,
    ],
  );
  return result.rows[0] ? toSummary(result.rows[0]) : null;
}

export async function deleteMmsPlaylist(
  auth0Subject: string,
  playlistId: string,
  executor?: TransactionExecutor,
) {
  const result = await database(executor).query<{ id: string }>(
    `DELETE FROM mms_playlists AS p
     USING app_users AS u
     WHERE u.auth0_subject = $1
       AND p.user_id = u.id
       AND p.id = $2
     RETURNING p.id`,
    [auth0Subject, playlistId],
  );
  return result.rows.length > 0;
}

async function lockOwnedPlaylist(
  transaction: TransactionExecutor,
  auth0Subject: string,
  playlistId: string,
) {
  const result = await transaction.query<{ id: string }>(
    `SELECT p.id
     FROM mms_playlists AS p
     INNER JOIN app_users AS u ON u.id = p.user_id
     WHERE u.auth0_subject = $1 AND p.id = $2
     FOR UPDATE OF p`,
    [auth0Subject, playlistId],
  );
  if (!result.rows[0]) throw new MmsPlaylistRepositoryError("playlist_not_found");
}

async function touchPlaylist(transaction: TransactionExecutor, playlistId: string) {
  await transaction.query(
    `UPDATE mms_playlists SET updated_at = now() WHERE id = $1`,
    [playlistId],
  );
}

export async function addMmsPlaylistTrack(
  auth0Subject: string,
  playlistId: string,
  input: ParsedMmsPlaylistTrack,
  executor?: TransactionExecutor,
) {
  return inTransaction(executor, async (transaction) => {
    await lockOwnedPlaylist(transaction, auth0Subject, playlistId);
    let result: { rows: PlaylistTrackRow[] };
    try {
      result = await transaction.query<PlaylistTrackRow>(
        `INSERT INTO mms_playlist_tracks (
           playlist_id,
           track_key,
           source,
           source_id,
           tidal_track_id,
           title,
           artist,
           album,
           artwork_url,
           duration_seconds,
           playback_available,
           position
         )
         VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, NULLIF($9, ''), $10, $11,
           (SELECT COALESCE(max(position), -1) + 1 FROM mms_playlist_tracks WHERE playlist_id = $1)
         )
         RETURNING *`,
        [
          playlistId,
          input.trackKey,
          input.source,
          input.sourceId,
          input.tidalTrackId,
          input.title,
          input.artist,
          input.album,
          input.artworkUrl,
          input.durationSeconds,
          input.playbackAvailable,
        ],
      );
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "23505") {
        throw new MmsPlaylistRepositoryError("playlist_track_already_exists");
      }
      throw error;
    }
    await touchPlaylist(transaction, playlistId);
    return toTrack(result.rows[0]);
  });
}

export async function deleteMmsPlaylistTrack(
  auth0Subject: string,
  playlistId: string,
  itemId: string,
  executor?: TransactionExecutor,
) {
  return inTransaction(executor, async (transaction) => {
    await lockOwnedPlaylist(transaction, auth0Subject, playlistId);
    const deleted = await transaction.query<{ id: string }>(
      `DELETE FROM mms_playlist_tracks
       WHERE playlist_id = $1 AND id = $2
       RETURNING id`,
      [playlistId, itemId],
    );
    if (!deleted.rows[0]) {
      throw new MmsPlaylistRepositoryError("playlist_track_not_found");
    }
    await transaction.query("SET CONSTRAINTS mms_playlist_tracks_position_unique DEFERRED");
    await transaction.query(
      `WITH ordered AS (
         SELECT id, row_number() OVER (ORDER BY position, id)::integer - 1 AS next_position
         FROM mms_playlist_tracks
         WHERE playlist_id = $1
       )
       UPDATE mms_playlist_tracks AS t
       SET position = ordered.next_position
       FROM ordered
       WHERE t.id = ordered.id`,
      [playlistId],
    );
    await touchPlaylist(transaction, playlistId);
    return true;
  });
}

export async function reorderMmsPlaylistTracks(
  auth0Subject: string,
  playlistId: string,
  itemIds: string[],
  executor?: TransactionExecutor,
) {
  return inTransaction(executor, async (transaction) => {
    await lockOwnedPlaylist(transaction, auth0Subject, playlistId);
    const current = await transaction.query<{ id: string }>(
      `SELECT id
       FROM mms_playlist_tracks
       WHERE playlist_id = $1
       ORDER BY position, id
       FOR UPDATE`,
      [playlistId],
    );
    const currentIds = new Set(current.rows.map((row) => row.id));
    if (currentIds.size !== itemIds.length || itemIds.some((id) => !currentIds.has(id))) {
      throw new MmsPlaylistRepositoryError("invalid_playlist_track_order");
    }
    await transaction.query("SET CONSTRAINTS mms_playlist_tracks_position_unique DEFERRED");
    await transaction.query(
      `UPDATE mms_playlist_tracks AS t
       SET position = ordering.ordinal::integer - 1
       FROM unnest($2::uuid[]) WITH ORDINALITY AS ordering(id, ordinal)
       WHERE t.playlist_id = $1 AND t.id = ordering.id`,
      [playlistId, itemIds],
    );
    await touchPlaylist(transaction, playlistId);
    return true;
  });
}
