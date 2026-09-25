import type { QueryExecutor } from "@/lib/ems/admin";

type JobRow = {
  id: string; status: string; phase: string; genre_codes: Array<{ code: string; name: string }> | null;
  genre_index: number; next_start_index: number; request_count: number; discovered_count: number;
  staged_count: number; matched_count: number; pending_count: number;
  batch_discovered_count: number; next_batch_at: string | null; error_code: string | null;
  created_at: string; updated_at: string; finished_at: string | null;
};

export async function getMelonIngestion(executor: QueryExecutor) {
  const [jobs, totals, genres, tracks] = await Promise.all([
    executor.query<JobRow>(`
      SELECT j.*, (SELECT count(*)::int FROM ems_ingest_candidates c
                    WHERE c.run_id = j.id AND c.resolver_status = 'matched') AS matched_count,
             (SELECT count(*)::int FROM ems_ingest_candidates c WHERE c.run_id = j.id
                AND c.resolver_status IN ('pending', 'resolving', 'retryable')) AS pending_count
        FROM ems_melon_jobs j ORDER BY j.created_at DESC LIMIT 1`),
    executor.query<{ source_tracks: number; matched_tracks: number }>(`
      SELECT (SELECT count(*)::int FROM ems_melon_tracks) AS source_tracks,
             (SELECT count(*)::int FROM ems_track_sources WHERE source_type = 'melon') AS matched_tracks`),
    executor.query<{ code: string; name: string; track_count: number }>(`
      SELECT genre_code AS code, max(genre_name) AS name, count(*)::int AS track_count
        FROM ems_melon_track_genres GROUP BY genre_code ORDER BY genre_code`),
    executor.query<{ song_id: string; title: string; artist: string; album: string | null;
      source_url: string; genres: string[]; first_seen_at: string; last_seen_at: string; tidal_id: string | null }>(`
      SELECT t.song_id, t.title, t.artist, t.album, t.source_url,
             COALESCE((SELECT array_agg(DISTINCT g.genre_name ORDER BY g.genre_name)
                         FROM ems_melon_track_genres g WHERE g.song_id = t.song_id), '{}') AS genres,
             t.first_seen_at, t.last_seen_at, e.tidal_id
        FROM (SELECT * FROM ems_melon_tracks ORDER BY last_seen_at DESC, song_id DESC LIMIT 30) t
        LEFT JOIN ems_track_sources s ON s.source_type = 'melon' AND s.source_id = t.song_id
        LEFT JOIN ems_tracks e ON e.id = s.track_id
       ORDER BY t.last_seen_at DESC, t.song_id DESC`),
  ]);
  const row = jobs.rows[0];
  const genre = row?.genre_codes?.[Number(row.genre_index)];
  return {
    job: row ? {
      id: row.id, status: row.status, phase: row.phase,
      genreCode: genre?.code ?? null, genreName: genre?.name ?? null,
      nextStartIndex: Number(row.next_start_index), requestCount: Number(row.request_count),
      discoveredCount: Number(row.discovered_count), stagedCount: Number(row.staged_count),
      matchedCount: Number(row.matched_count), pendingCount: Number(row.pending_count),
      batchDiscoveredCount: Number(row.batch_discovered_count), nextBatchAt: row.next_batch_at,
      errorCode: row.error_code,
      createdAt: row.created_at, updatedAt: row.updated_at, finishedAt: row.finished_at,
    } : null,
    totals: {
      sourceTracks: Number(totals.rows[0]?.source_tracks ?? 0),
      matchedTracks: Number(totals.rows[0]?.matched_tracks ?? 0),
    },
    genres: genres.rows.map((item) => ({ code: item.code, name: item.name, trackCount: Number(item.track_count) })),
    tracks: tracks.rows.map((item) => ({
      songId: item.song_id, title: item.title, artist: item.artist, album: item.album,
      sourceUrl: item.source_url, genres: item.genres,
      firstSeenAt: item.first_seen_at, lastSeenAt: item.last_seen_at, tidalId: item.tidal_id,
    })),
  };
}

export async function createMelonIngestion(executor: QueryExecutor) {
  const result = await executor.query<{ id: string }>(`
    WITH run AS (
      INSERT INTO ems_ingest_runs (run_type, snapshot_id, status, request_budget)
      VALUES ('melon_genres', 'admin-melon-' || gen_random_uuid()::text, 'pending', 0)
      RETURNING id
    ), job AS (
      INSERT INTO ems_melon_jobs (id, status)
      SELECT id, 'pending' FROM run RETURNING id
    ), routine AS (
      UPDATE ems_source_routines SET status = 'queued', current_run_id = (SELECT id FROM job),
             last_checked_at = now(), error_code = NULL, updated_at = now()
       WHERE source_key = 'melon_genres' RETURNING source_key
    ) SELECT id FROM job`);
  if (!result.rows[0]) throw new Error("melon_job_creation_failed");
  return result.rows[0].id;
}

export async function setMelonIngestionStatus(id: string, action: "pause" | "resume", executor: QueryExecutor) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return false;
  const from = action === "pause" ? ["pending", "running"] : ["paused"];
  const to = action === "pause" ? "paused" : "pending";
  const result = await executor.query<{ id: string }>(`
    WITH changed AS (
      UPDATE ems_melon_jobs SET status = $2,
             phase = CASE WHEN $2 = 'paused' THEN 'paused' ELSE 'queued' END,
             updated_at = now()
       WHERE id = $1 AND status = ANY($3::text[]) RETURNING id
    ), run AS (
      UPDATE ems_ingest_runs SET status = $2, heartbeat_at = now()
       WHERE id IN (SELECT id FROM changed) RETURNING id
    ) SELECT id FROM changed`, [id, to, from]);
  return Boolean(result.rows[0]);
}
