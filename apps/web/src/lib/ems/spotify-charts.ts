import type { QueryExecutor } from "@/lib/ems/admin";

export const SPOTIFY_CHART_TARGETS = [
  {
    id: "37i9dQZEVXbNG2KDcFcKOF",
    title: "인기 곡 - 글로벌",
    description: "현재 가장 많이 재생된 트랙의 주간 글로벌 차트",
  },
  {
    id: "37i9dQZEVXbJZGli0rRP3r",
    title: "인기 곡 - 대한민국",
    description: "현재 가장 많이 재생된 트랙의 주간 대한민국 차트",
  },
  {
    id: "37i9dQZEVXbMDoHDwVN2tF",
    title: "Top 50 - 글로벌",
    description: "현재 가장 많이 재생된 트랙의 일간 글로벌 차트",
  },
  {
    id: "37i9dQZEVXbNxXF4SkHj9F",
    title: "Top 50 - 대한민국",
    description: "현재 가장 많이 재생된 트랙의 일간 대한민국 차트",
  },
] as const;

export type SpotifyChartRunStatus =
  | "pending"
  | "running"
  | "paused"
  | "completed"
  | "failed";

export type SpotifyChartAdminRun = {
  id: string;
  status: SpotifyChartRunStatus;
  phase: string;
  spotifyRequestBudget: number;
  spotifyRequestCount: number;
  tidalRequestBudget: number;
  tidalRequestCount: number;
  requestedCount: number;
  matchedCount: number;
  pendingCount: number;
  ambiguousCount: number;
  notFoundCount: number;
  unavailableCount: number;
  retryableCount: number;
  budgetExhaustedCount: number;
  playlistCount: number;
  membershipCount: number;
  active: boolean;
  errorCode: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  activatedAt: string | null;
  finishedAt: string | null;
  playlists: Array<{
    spotifyId: string;
    title: string;
    description: string;
    artworkUrl: string | null;
    sourceUrl: string;
    displayOrder: number;
    sourceTrackCount: number;
    matchedCount: number;
  }>;
};

export async function createSpotifyChartRun(
  executor: QueryExecutor,
  actor: string,
) {
  const result = await executor.query<{ id: string }>(`
    WITH available AS (
      SELECT 1 WHERE NOT EXISTS (
        SELECT 1 FROM ems_spotify_chart_runs
        WHERE status IN ('pending', 'running', 'paused')
      )
    ), run AS (
      INSERT INTO ems_ingest_runs
        (run_type, snapshot_id, status, request_budget, requested_count)
      SELECT 'tidal_resolve', 'spotify-charts-' || gen_random_uuid()::text,
             'pending', 450, 0
      FROM available
      RETURNING id
    ), chart AS (
      INSERT INTO ems_spotify_chart_runs (run_id, created_by)
      SELECT id, $1 FROM run
      RETURNING run_id
    )
    SELECT run_id AS id FROM chart`, [actor]);
  const id = result.rows[0]?.id;
  if (!id) throw new Error("spotify_chart_run_already_open");
  return id;
}

export async function changeSpotifyChartRun(
  executor: QueryExecutor,
  runId: string,
  action: "pause" | "resume",
) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(runId)) {
    return null;
  }
  const nextStatus = action === "pause" ? "paused" : "pending";
  const fromStatuses = action === "pause" ? ["pending", "running"] : ["paused"];
  const result = await executor.query<{ run_id: string; status: SpotifyChartRunStatus }>(`
    WITH changed AS (
      UPDATE ems_spotify_chart_runs
         SET status = $2, phase = CASE WHEN $2 = 'paused' THEN 'paused' ELSE 'resolving' END,
             error_code = CASE WHEN $2 = 'pending' THEN NULL ELSE error_code END,
             updated_at = now()
       WHERE run_id = $1 AND status = ANY($3::text[])
         AND ($2 <> 'pending' OR tidal_request_count < 450)
       RETURNING run_id, status
    ), ingest AS (
      UPDATE ems_ingest_runs r
         SET status = changed.status,
             error_code = CASE WHEN changed.status = 'pending' THEN NULL ELSE r.error_code END,
             heartbeat_at = now()
        FROM changed WHERE r.id = changed.run_id
    )
    SELECT run_id, status FROM changed`, [runId, nextStatus, fromStatuses]);
  return result.rows[0] ?? null;
}

export async function listSpotifyChartRuns(
  executor: QueryExecutor,
): Promise<SpotifyChartAdminRun[]> {
  const runs = await executor.query<{
    id: string; status: SpotifyChartRunStatus; phase: string;
    spotify_request_budget: number; spotify_request_count: number;
    tidal_request_budget: number; tidal_request_count: number;
    requested_count: number; matched_count: number; pending_count: number;
    ambiguous_count: number; not_found_count: number; unavailable_count: number;
    retryable_count: number; budget_exhausted_count: number;
    playlist_count: number; membership_count: number; active: boolean;
    error_code: string | null; created_by: string; created_at: string;
    updated_at: string; activated_at: string | null; finished_at: string | null;
  }>(`
    SELECT chart.run_id AS id, chart.status, chart.phase,
           chart.spotify_request_budget, chart.spotify_request_count,
           ingest.request_budget AS tidal_request_budget, chart.tidal_request_count,
           ingest.requested_count, ingest.matched_count,
           count(candidate.id) FILTER (WHERE candidate.resolver_status IN ('pending', 'resolving'))::int AS pending_count,
           count(candidate.id) FILTER (WHERE candidate.resolver_status = 'ambiguous')::int AS ambiguous_count,
           count(candidate.id) FILTER (WHERE candidate.resolver_status = 'not_found')::int AS not_found_count,
           count(candidate.id) FILTER (WHERE candidate.resolver_status = 'unavailable')::int AS unavailable_count,
           count(candidate.id) FILTER (WHERE candidate.resolver_status = 'retryable')::int AS retryable_count,
           count(candidate.id) FILTER (WHERE candidate.resolver_status = 'budget_exhausted')::int AS budget_exhausted_count,
           (SELECT count(*)::int FROM ems_spotify_chart_playlists p WHERE p.run_id = chart.run_id) AS playlist_count,
           (SELECT count(*)::int FROM ems_spotify_chart_items i
              JOIN ems_spotify_chart_playlists p ON p.id = i.playlist_id
             WHERE p.run_id = chart.run_id) AS membership_count,
           chart.active, chart.error_code, chart.created_by, chart.created_at,
           chart.updated_at, chart.activated_at, chart.finished_at
      FROM ems_spotify_chart_runs chart
      JOIN ems_ingest_runs ingest ON ingest.id = chart.run_id
      LEFT JOIN ems_ingest_candidates candidate ON candidate.run_id = chart.run_id
     GROUP BY chart.run_id, ingest.request_budget, ingest.requested_count, ingest.matched_count
     ORDER BY chart.created_at DESC
     LIMIT 10`);
  const ids = runs.rows.map((run) => run.id);
  const playlists = ids.length ? await executor.query<{
    run_id: string; spotify_id: string; title: string; description: string;
    artwork_url: string | null; source_url: string; display_order: number;
    source_track_count: number; matched_count: number;
  }>(`
    SELECT playlist.run_id, playlist.spotify_id, playlist.title, playlist.description,
           playlist.artwork_url, playlist.source_url, playlist.display_order,
           playlist.source_track_count,
           count(DISTINCT candidate.candidate_key)::int AS matched_count
      FROM ems_spotify_chart_playlists playlist
      LEFT JOIN ems_spotify_chart_items item ON item.playlist_id = playlist.id
      LEFT JOIN ems_ingest_candidates candidate
        ON candidate.run_id = playlist.run_id AND candidate.candidate_key = item.candidate_key
       AND candidate.resolver_status = 'matched'
     WHERE playlist.run_id = ANY($1::uuid[])
     GROUP BY playlist.id
     ORDER BY playlist.run_id, playlist.display_order`, [ids]) : { rows: [] };
  const byRun = new Map<string, typeof playlists.rows>();
  for (const playlist of playlists.rows) {
    byRun.set(playlist.run_id, [...(byRun.get(playlist.run_id) ?? []), playlist]);
  }
  return runs.rows.map((run) => ({
    id: run.id,
    status: run.status,
    phase: run.phase,
    spotifyRequestBudget: Number(run.spotify_request_budget),
    spotifyRequestCount: Number(run.spotify_request_count),
    tidalRequestBudget: Number(run.tidal_request_budget),
    tidalRequestCount: Number(run.tidal_request_count),
    requestedCount: Number(run.requested_count),
    matchedCount: Number(run.matched_count),
    pendingCount: Number(run.pending_count),
    ambiguousCount: Number(run.ambiguous_count),
    notFoundCount: Number(run.not_found_count),
    unavailableCount: Number(run.unavailable_count),
    retryableCount: Number(run.retryable_count),
    budgetExhaustedCount: Number(run.budget_exhausted_count),
    playlistCount: Number(run.playlist_count),
    membershipCount: Number(run.membership_count),
    active: run.active,
    errorCode: run.error_code,
    createdBy: run.created_by,
    createdAt: run.created_at,
    updatedAt: run.updated_at,
    activatedAt: run.activated_at,
    finishedAt: run.finished_at,
    playlists: (byRun.get(run.id) ?? []).map((playlist) => ({
      spotifyId: playlist.spotify_id,
      title: playlist.title,
      description: playlist.description,
      artworkUrl: playlist.artwork_url,
      sourceUrl: playlist.source_url,
      displayOrder: Number(playlist.display_order),
      sourceTrackCount: Number(playlist.source_track_count),
      matchedCount: Number(playlist.matched_count),
    })),
  }));
}
