import type { QueryExecutor } from "@/lib/ems/admin";

type JobRow = {
  id: string;
  status: string;
  phase: string;
  starting_active_count: number;
  active_track_count: number;
  request_count: number;
  next_playlist_index: number;
  playlist_count: number;
  candidate_count: number;
  matched_count: number;
  pending_count: number;
  retryable_count: number;
  error_code: string | null;
  next_retry_at: string | null;
  heartbeat_at: string | null;
  created_at: string;
  updated_at: string;
  finished_at: string | null;
};

type RunRow = {
  id: string;
  run_type: string;
  status: string;
  candidate_count: number;
  processed_count: number;
  matched_count: number;
  retryable_count: number;
  error_code: string | null;
  heartbeat_at: string | null;
  started_at: string | null;
  created_at: string;
};

type BucketRow = { bucket: string; count: number };
type RunBucketRow = BucketRow & { kind: "candidate" | "processed" | "matched" };

const BUCKET_MS = 5 * 60 * 1000;
const LOOKBACK_BUCKETS = 12 * 60 / 5;

function cumulativeBuckets(total: number, rows: BucketRow[], firstBucket: number, lastBucket: number) {
  const counts = new Map(rows.map((row) => [Number(row.bucket), Number(row.count)]));
  let value = Math.max(0, total - rows.reduce((sum, row) => sum + Number(row.count), 0));
  const values = [value];
  for (let bucket = firstBucket; bucket <= lastBucket; bucket++) {
    value += counts.get(bucket) ?? 0;
    values.push(value);
  }
  return values;
}

function sampleTimes(firstBucket: number, lastBucket: number, now: number) {
  return [new Date(firstBucket * BUCKET_MS).toISOString(),
    ...Array.from({ length: lastBucket - firstBucket + 1 }, (_, index) =>
      new Date(Math.min(now, (firstBucket + index + 1) * BUCKET_MS)).toISOString())];
}

function mapJob(row: JobRow) {
  return {
    id: row.id,
    status: row.status,
    phase: row.phase,
    startingActiveCount: Number(row.starting_active_count),
    activeTrackCount: Number(row.active_track_count),
    requestCount: Number(row.request_count),
    nextPlaylistIndex: Number(row.next_playlist_index),
    playlistCount: Number(row.playlist_count),
    candidateCount: Number(row.candidate_count),
    matchedCount: Number(row.matched_count),
    pendingCount: Number(row.pending_count),
    retryableCount: Number(row.retryable_count),
    errorCode: row.error_code,
    nextRetryAt: row.next_retry_at,
    heartbeatAt: row.heartbeat_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at,
  };
}

export type EmsAdminIngestJob = ReturnType<typeof mapJob>;

const JOB_SELECT = `
  SELECT j.id, j.status, j.phase, j.starting_active_count, j.active_track_count, j.request_count,
         j.next_playlist_index,
         COALESCE(jsonb_array_length(j.playlists), 0) AS playlist_count,
         (SELECT count(*)::int FROM ems_ingest_candidates c WHERE c.run_id = j.id) AS candidate_count,
         (SELECT count(*)::int FROM ems_ingest_candidates c WHERE c.run_id = j.id AND c.resolver_status = 'matched') AS matched_count,
         (SELECT count(*)::int FROM ems_ingest_candidates c WHERE c.run_id = j.id AND c.resolver_status IN ('pending', 'resolving')) AS pending_count,
         (SELECT count(*)::int FROM ems_ingest_candidates c WHERE c.run_id = j.id AND c.resolver_status = 'retryable') AS retryable_count,
         j.error_code, j.next_retry_at, j.heartbeat_at, j.created_at, j.updated_at, j.finished_at
    FROM ems_admin_ingest_jobs j`;

export async function getEmsAdminIngestion(executor: QueryExecutor) {
  const now = Date.now();
  const lastBucket = Math.floor(now / BUCKET_MS);
  const firstBucket = lastBucket - LOOKBACK_BUCKETS + 1;
  const since = new Date(firstBucket * BUCKET_MS).toISOString();
  const [jobResult, activeResult, currentRunResult, catalogBuckets] = await Promise.all([
    executor.query<JobRow>(`${JOB_SELECT} ORDER BY j.created_at DESC LIMIT 1`),
    executor.query<{ count: number; embedded_count: number }>(`
      SELECT count(*)::int AS count,
             count(*) FILTER (WHERE emb.status = 'completed')::int AS embedded_count
        FROM ems_tracks e LEFT JOIN ems_track_embeddings emb ON emb.track_id = e.id
       WHERE e.status = 'active'`),
    executor.query<RunRow>(`
      SELECT r.id, r.run_type, r.status, r.error_code, r.heartbeat_at, r.started_at, r.created_at,
             counts.candidate_count, counts.processed_count, counts.matched_count,
             counts.retryable_count
        FROM (
          SELECT id, run_type, status, error_code, heartbeat_at, started_at, created_at
            FROM ems_ingest_runs
           WHERE run_type IN ('musicbrainz_snapshot', 'tidal_resolve')
           ORDER BY (status = 'running') DESC, (status = 'pending') DESC, created_at DESC
           LIMIT 1
        ) r
        CROSS JOIN LATERAL (
          SELECT count(*)::int AS candidate_count,
                 count(*) FILTER (WHERE resolver_status IN ('matched', 'ambiguous', 'not_found', 'unavailable', 'budget_exhausted'))::int AS processed_count,
                 count(*) FILTER (WHERE resolver_status = 'matched')::int AS matched_count,
                 count(*) FILTER (WHERE resolver_status = 'retryable')::int AS retryable_count
            FROM ems_ingest_candidates WHERE run_id = r.id
        ) counts
      `),
    executor.query<BucketRow>(`
      SELECT floor(extract(epoch FROM first_seen_at) / 300)::bigint AS bucket, count(*)::int AS count
        FROM ems_tracks
       WHERE status = 'active' AND first_seen_at >= $1::timestamptz
       GROUP BY 1 ORDER BY 1`, [since]),
  ]);
  const job = jobResult.rows[0];
  const run = currentRunResult.rows[0];
  const samples = job ? await executor.query<{ sampled_at: string; active_track_count: number; candidate_count: number; matched_count: number }>(`
    SELECT sampled_at, active_track_count, candidate_count, matched_count
      FROM (SELECT id, sampled_at, active_track_count, candidate_count, matched_count
              FROM ems_admin_ingest_samples WHERE job_id = $1 ORDER BY id DESC LIMIT 500) recent
     ORDER BY id`, [job.id]) : { rows: [] };
  const runBuckets = run ? await executor.query<RunBucketRow>(`
    SELECT 'candidate' AS kind, floor(extract(epoch FROM created_at) / 300)::bigint AS bucket, count(*)::int AS count
      FROM ems_ingest_candidates WHERE run_id = $1 AND created_at >= $2::timestamptz GROUP BY 2
    UNION ALL
    SELECT 'processed' AS kind, floor(extract(epoch FROM resolved_at) / 300)::bigint AS bucket, count(*)::int AS count
      FROM ems_ingest_candidates WHERE run_id = $1 AND resolver_status IN ('matched', 'ambiguous', 'not_found', 'unavailable', 'budget_exhausted')
        AND resolved_at >= $2::timestamptz GROUP BY 2
    UNION ALL
    SELECT 'matched' AS kind, floor(extract(epoch FROM resolved_at) / 300)::bigint AS bucket, count(*)::int AS count
      FROM ems_ingest_candidates WHERE run_id = $1 AND resolver_status = 'matched'
        AND resolved_at >= $2::timestamptz GROUP BY 2`, [run.id, since]) : { rows: [] };
  const times = sampleTimes(firstBucket, lastBucket, now);
  const activeTrackCount = Number(activeResult.rows[0]?.count ?? 0);
  const catalogValues = cumulativeBuckets(activeTrackCount, catalogBuckets.rows, firstBucket, lastBucket);
  const byKind = (kind: RunBucketRow["kind"]) => runBuckets.rows.filter((row) => row.kind === kind);
  const candidateValues = cumulativeBuckets(Number(run?.candidate_count ?? 0), byKind("candidate"), firstBucket, lastBucket);
  const processedValues = cumulativeBuckets(Number(run?.processed_count ?? 0), byKind("processed"), firstBucket, lastBucket);
  const matchedValues = cumulativeBuckets(Number(run?.matched_count ?? 0), byKind("matched"), firstBucket, lastBucket);
  const candidateCount = candidateValues[candidateValues.length - 1];
  const processedCount = processedValues[processedValues.length - 1];
  const matchedCount = matchedValues[matchedValues.length - 1];
  return {
    activeTrackCount,
    embeddingCompletedCount: Number(activeResult.rows[0]?.embedded_count ?? 0),
    job: job ? mapJob(job) : null,
    currentRun: run ? {
      id: run.id,
      runType: run.run_type,
      status: run.status,
      candidateCount,
      processedCount,
      matchedCount,
      pendingCount: Math.max(0, candidateCount - processedCount),
      retryableCount: Number(run.retryable_count),
      errorCode: run.error_code,
      heartbeatAt: run.heartbeat_at,
      startedAt: run.started_at,
      createdAt: run.created_at,
    } : null,
    catalogSamples: times.map((sampledAt, index) => ({ sampledAt, activeTrackCount: catalogValues[index] })),
    runSamples: run ? times.map((sampledAt, index) => ({
      sampledAt,
      candidateCount: candidateValues[index],
      processedCount: processedValues[index],
      matchedCount: matchedValues[index],
    })) : [],
    samples: samples.rows.map((row) => ({
      sampledAt: row.sampled_at,
      activeTrackCount: Number(row.active_track_count),
      candidateCount: Number(row.candidate_count),
      matchedCount: Number(row.matched_count),
    })),
  };
}

export async function createEmsAdminIngestion(executor: QueryExecutor) {
  const result = await executor.query<{ id: string }>(`
    WITH baseline AS (SELECT count(*)::int AS active_count FROM ems_tracks WHERE status = 'active'),
         run AS (
           INSERT INTO ems_ingest_runs (run_type, snapshot_id, status, request_budget, requested_count)
           VALUES ('tidal_resolve', 'admin-editorial-' || gen_random_uuid()::text, 'pending', 0, 0)
           RETURNING id
         ),
         job AS (
           INSERT INTO ems_admin_ingest_jobs (id, status, starting_active_count, active_track_count)
           SELECT run.id, 'pending', baseline.active_count, baseline.active_count FROM run CROSS JOIN baseline
           RETURNING id, active_track_count
         ),
         sample AS (
           INSERT INTO ems_admin_ingest_samples (job_id, active_track_count, candidate_count, matched_count)
           SELECT id, active_track_count, 0, 0 FROM job
         )
    SELECT id FROM job`);
  const id = result.rows[0]?.id;
  if (!id) throw new Error("admin_ingest_creation_failed");
  return id;
}

export async function setEmsAdminIngestionStatus(id: string, action: "pause" | "resume", executor: QueryExecutor) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error("invalid_admin_ingest_job_id");
  const from = action === "pause" ? ["pending", "running"] : ["paused"];
  const to = action === "pause" ? "paused" : "pending";
  const result = await executor.query<{ id: string }>(`
    WITH changed AS (
      UPDATE ems_admin_ingest_jobs SET status = $2, phase = CASE WHEN $2 = 'paused' THEN 'paused' ELSE 'queued' END,
             updated_at = now() WHERE id = $1 AND status = ANY($3::text[]) RETURNING id
    ), run AS (
      UPDATE ems_ingest_runs SET status = $2, heartbeat_at = now()
       WHERE id IN (SELECT id FROM changed) RETURNING id
    ) SELECT id FROM changed`, [id, to, from]);
  return Boolean(result.rows[0]);
}
