import type { QueryExecutor } from "@/lib/ems/admin";

export type ManualMusicSource = "melon" | "tidal";

export function classifyManualMusicUrl(raw: string): ManualMusicSource | null {
  if (raw.length > 2048) return null;
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash) return null;
  const host = url.hostname.toLowerCase();
  if (host === "www.melon.com") {
    const genrePage = url.pathname === "/genre/song_list.htm";
    const pagingPage = url.pathname === "/genre/song_listPaging.htm";
    const genre = url.searchParams.get("gnrCode");
    if ((!genrePage && !pagingPage) || !/^GN0[1-8]00$/.test(genre ?? "")) return null;
    if ([...url.searchParams.keys()].some((key) => !["gnrCode", "startIndex", "pageSize", "dtlGnrCode", "orderBy", "steadyYn"].includes(key))) return null;
    if (genrePage && [...url.searchParams.keys()].some((key) => key !== "gnrCode")) return null;
    if (pagingPage) {
      const start = Number(url.searchParams.get("startIndex"));
      const size = Number(url.searchParams.get("pageSize") ?? "50");
      if (!Number.isInteger(start) || start < 1 || start > 1_000_000 || size !== 50) return null;
    }
    return "melon";
  }
  if (!["tidal.com", "www.tidal.com", "listen.tidal.com"].includes(host)) return null;
  if (url.search || url.hash) return null;
  const segments = url.pathname.split("/").filter(Boolean);
  const browseSegments = segments[0] === "browse" ? segments.slice(1) : segments;
  if (browseSegments.length !== 2 || !["track", "album", "playlist"].includes(browseSegments[0]) ||
      !/^[A-Za-z0-9:_-]{1,128}$/.test(browseSegments[1])) return null;
  return "tidal";
}

export async function createManualUrlImport(executor: QueryExecutor, sourceUrl: string, actor: string) {
  const sourceType = classifyManualMusicUrl(sourceUrl);
  if (!sourceType) throw new Error("invalid_manual_music_url");
  const result = await executor.query<{ id: string }>(`
    INSERT INTO ems_manual_url_import_jobs (source_type, source_url, created_by)
    VALUES ($1, $2, $3)
    RETURNING id`, [sourceType, sourceUrl, actor]);
  const id = result.rows[0]?.id;
  if (!id) throw new Error("manual_url_import_creation_failed");
  return id;
}

export async function listManualUrlImports(executor: QueryExecutor) {
  const jobs = await executor.query<{
    id: string; source_type: ManualMusicSource; source_url: string; status: string;
    phase: string; item_count: number; request_count: number; error_code: string | null;
    created_by: string; collected_at: string | null; created_at: string; updated_at: string;
  }>(`SELECT id, source_type, source_url, status, phase, item_count, request_count,
             error_code, created_by, collected_at, created_at, updated_at
        FROM ems_manual_url_import_jobs ORDER BY created_at DESC LIMIT 30`);
  const ids = jobs.rows.map((job) => job.id);
  const items = ids.length ? await executor.query<{
    id: string; job_id: string; sequence_no: number; source_id: string; source_item_url: string;
    title: string; artist: string; album: string | null; duration_ms: number | null;
    artwork_url: string | null; release_date: string | null; metadata: Record<string, unknown>;
    status: string; collected_at: string; candidate_status: string | null; tidal_id: string | null;
  }>(`SELECT i.id, i.job_id, i.sequence_no, i.source_id, i.source_item_url, i.title,
             i.artist, i.album, i.duration_ms, i.artwork_url, i.release_date, i.metadata,
             i.status, i.collected_at, c.resolver_status AS candidate_status, c.tidal_id
        FROM ems_manual_url_import_items i
        LEFT JOIN ems_ingest_candidates c
          ON c.run_id = i.ingest_run_id AND c.candidate_key = 'urlimport:' || i.id::text
       WHERE i.job_id = ANY($1::uuid[]) ORDER BY i.job_id, i.sequence_no`, [ids]) : { rows: [] };
  const itemsByJob = new Map<string, typeof items.rows>();
  for (const item of items.rows) itemsByJob.set(item.job_id, [...(itemsByJob.get(item.job_id) ?? []), item]);
  return jobs.rows.map((job) => ({
    id: job.id,
    sourceType: job.source_type,
    sourceUrl: job.source_url,
    status: job.status,
    phase: job.phase,
    itemCount: Number(job.item_count),
    requestCount: Number(job.request_count),
    errorCode: job.error_code,
    createdBy: job.created_by,
    collectedAt: job.collected_at,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
    items: (itemsByJob.get(job.id) ?? []).map((item) => ({
      id: item.id,
      sourceId: item.source_id,
      sourceItemUrl: item.source_item_url,
      title: item.title,
      artist: item.artist,
      album: item.album,
      durationMs: item.duration_ms,
      artworkUrl: item.artwork_url,
      releaseDate: item.release_date,
      metadata: item.metadata,
      status: item.status,
      collectedAt: item.collected_at,
      candidateStatus: item.candidate_status,
      tidalId: item.tidal_id,
    })),
  }));
}

export async function decideManualUrlImportItem(
  executor: QueryExecutor,
  itemId: string,
  action: "approve" | "reject",
) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(itemId)) return false;
  if (action === "approve") {
    const result = await executor.query<{ id: string }>(`
      UPDATE ems_manual_url_import_items i SET status = 'approved'
        FROM ems_manual_url_import_jobs j
       WHERE i.id = $1 AND i.job_id = j.id AND i.status = 'review' AND j.status = 'review'
       RETURNING i.id`, [itemId]);
    return Boolean(result.rows[0]);
  }
  if (action === "reject") {
    const result = await executor.query<{ id: string }>(`
      WITH changed AS (
        UPDATE ems_manual_url_import_items SET status = 'rejected'
         WHERE id = $1 AND status = 'review' RETURNING id, job_id
      ), parent AS (
        UPDATE ems_manual_url_import_jobs j
           SET status = CASE
                 WHEN EXISTS (SELECT 1 FROM ems_manual_url_import_items i
                               WHERE i.job_id = j.id AND i.status = 'review' AND i.id <> changed.id)
                   OR EXISTS (SELECT 1 FROM ems_manual_url_import_items i
                               WHERE i.job_id = j.id AND i.status = 'approved') THEN 'review'
                 WHEN EXISTS (SELECT 1 FROM ems_manual_url_import_items i
                               JOIN ems_ingest_runs r ON r.id = i.ingest_run_id
                              WHERE i.job_id = j.id AND i.status = 'queued' AND r.status <> 'completed') THEN 'processing'
                 ELSE 'completed' END,
               phase = CASE WHEN EXISTS (SELECT 1 FROM ems_manual_url_import_items i
                                          WHERE i.job_id = j.id AND i.status = 'review' AND i.id <> changed.id)
                                  OR EXISTS (SELECT 1 FROM ems_manual_url_import_items i
                                          WHERE i.job_id = j.id AND i.status = 'approved') THEN 'review'
                            WHEN EXISTS (SELECT 1 FROM ems_manual_url_import_items i
                                          JOIN ems_ingest_runs r ON r.id = i.ingest_run_id
                                         WHERE i.job_id = j.id AND i.status = 'queued' AND r.status <> 'completed') THEN 'processing'
                            ELSE 'completed' END,
               updated_at = now()
          FROM changed WHERE j.id = changed.job_id
      ) SELECT id FROM changed`, [itemId]);
    return Boolean(result.rows[0]);
  }
  return false;
}

export async function startApprovedManualUrlImport(executor: QueryExecutor, jobId: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) return false;
  const result = await executor.query<{ id: string }>(`
    WITH selected_job AS (
      SELECT * FROM ems_manual_url_import_jobs
       WHERE id = $1 AND status = 'review' FOR UPDATE
    ), approved AS (
      SELECT i.*, j.source_type FROM ems_manual_url_import_items i
      JOIN selected_job j ON j.id = i.job_id
      WHERE i.status = 'approved'
    ), baseline AS (
      SELECT count(*)::int AS active_count FROM ems_tracks WHERE status = 'active'
    ), run AS (
      INSERT INTO ems_ingest_runs (run_type, snapshot_id, status, request_budget, requested_count)
      SELECT 'tidal_resolve', 'manual-url-' || gen_random_uuid()::text, 'pending', 0,
             (SELECT count(*)::int FROM approved)
        FROM selected_job
       WHERE EXISTS (SELECT 1 FROM approved)
         AND NOT EXISTS (SELECT 1 FROM ems_admin_ingest_jobs WHERE status IN ('pending', 'running', 'paused'))
      RETURNING id
    ), admin_job AS (
      INSERT INTO ems_admin_ingest_jobs
        (id, status, starting_active_count, active_track_count, playlists)
      SELECT run.id, 'pending', baseline.active_count, baseline.active_count, '[]'::jsonb
        FROM run CROSS JOIN baseline
      RETURNING id
    ), candidate AS (
      INSERT INTO ems_ingest_candidates
        (run_id, sequence_no, candidate_key, title, artist, album, duration_ms,
         release_date, selection_bucket, selection_score, tidal_id)
      SELECT run.id, row_number() OVER (ORDER BY approved.sequence_no) - 1,
             'urlimport:' || approved.id::text, approved.title, approved.artist,
             approved.album, approved.duration_ms, approved.release_date,
             CASE WHEN approved.source_type = 'melon' THEN 'melon' ELSE 'user_import' END,
             1.0, CASE WHEN approved.source_type = 'tidal' THEN approved.source_id ELSE NULL END
        FROM approved CROSS JOIN run
      RETURNING run_id, candidate_key
    ), queued AS (
      UPDATE ems_manual_url_import_items i SET status = 'queued', ingest_run_id = candidate.run_id
        FROM candidate WHERE candidate.candidate_key = 'urlimport:' || i.id::text
      RETURNING i.id, i.job_id
    ), updated_job AS (
      UPDATE ems_manual_url_import_jobs j SET status = 'processing', phase = 'resolving', updated_at = now()
        FROM queued WHERE j.id = queued.job_id RETURNING j.id
    ) SELECT id FROM updated_job`, [jobId]);
  return Boolean(result.rows[0]);
}
