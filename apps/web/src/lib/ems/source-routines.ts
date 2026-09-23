import type { QueryExecutor } from "@/lib/ems/admin";

type RoutineRow = {
  source_key: string;
  enabled: boolean;
  check_interval_seconds: number;
  status: string;
  next_check_at: string;
  last_checked_at: string | null;
  last_version: string | null;
  last_success_at: string | null;
  last_candidate_count: number;
  current_run_id: string | null;
  current_run_status: string | null;
  current_run_matched_count: number | null;
  current_run_pending_count: number | null;
  error_code: string | null;
};

function mapRoutine(row: RoutineRow) {
  return {
    key: row.source_key,
    enabled: row.enabled,
    intervalSeconds: Number(row.check_interval_seconds),
    status: row.status,
    nextCheckAt: row.next_check_at,
    lastCheckedAt: row.last_checked_at,
    lastVersion: row.last_version,
    lastSuccessAt: row.last_success_at,
    lastCandidateCount: Number(row.last_candidate_count),
    currentRunId: row.current_run_id,
    currentRunStatus: row.current_run_status,
    currentRunMatchedCount: Number(row.current_run_matched_count ?? 0),
    currentRunPendingCount: Number(row.current_run_pending_count ?? 0),
    errorCode: row.error_code,
  };
}

export async function listEmsSourceRoutines(executor: QueryExecutor) {
  const result = await executor.query<RoutineRow>(`
    SELECT s.source_key, s.enabled, s.check_interval_seconds, s.status, s.next_check_at,
           s.last_checked_at, s.last_version, s.last_success_at, s.last_candidate_count,
           s.current_run_id, r.status AS current_run_status,
           r.matched_count AS current_run_matched_count,
           (SELECT count(*)::int FROM ems_ingest_candidates c WHERE c.run_id = r.id
             AND c.resolver_status IN ('pending', 'resolving', 'retryable')) AS current_run_pending_count,
           s.error_code
      FROM ems_source_routines s LEFT JOIN ems_ingest_runs r ON r.id = s.current_run_id
     ORDER BY s.source_key`);
  return result.rows.map(mapRoutine);
}

export async function updateEmsSourceRoutine(key: string, action: "enable" | "disable" | "check_now", executor: QueryExecutor) {
  if (!["tidal_editorial", "musicbrainz_core", "musicbrainz_canonical"].includes(key)) throw new Error("invalid_ems_source_key");
  const result = await executor.query<RoutineRow>(`
    UPDATE ems_source_routines
       SET enabled = CASE WHEN $2 = 'enable' THEN true WHEN $2 = 'disable' THEN false ELSE enabled END,
           next_check_at = CASE WHEN $2 IN ('enable', 'check_now') THEN now() ELSE next_check_at END,
           error_code = CASE WHEN $2 = 'check_now' THEN NULL ELSE error_code END,
           updated_at = now()
     WHERE source_key = $1
     RETURNING source_key, enabled, check_interval_seconds, status, next_check_at,
               last_checked_at, last_version, last_success_at, last_candidate_count,
               current_run_id, NULL::text AS current_run_status,
               NULL::int AS current_run_matched_count, NULL::int AS current_run_pending_count,
               error_code`, [key, action]);
  if (!result.rows[0]) throw new Error("ems_source_not_found");
  if (action === "check_now" || action === "enable") {
    await executor.query(`UPDATE ems_ingest_runs SET status = 'pending', error_code = NULL
      WHERE id = $1 AND status IN ('paused', 'failed')`, [result.rows[0].current_run_id]);
  }
  return mapRoutine(result.rows[0]);
}
