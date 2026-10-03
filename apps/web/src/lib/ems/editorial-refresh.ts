import { isDeepStrictEqual } from "node:util";
import type { Pool } from "pg";
import type { QueryExecutor } from "@/lib/ems/admin";

export const EDITORIAL_SLUGS = ["new-releases", "seasonal-jazz", "night-rnb", "feel-good", "focus"];
export const EDITORIAL_CRITERIA = [
  { slug: "new-releases", title: "신곡", source: "Best New Tracks · New Arrivals", ranking: "플레이리스트 최근 갱신 → 곡 인기도 → 원래 곡 순서" },
  { slug: "seasonal-jazz", title: "재즈", source: "Jazz", ranking: "플레이리스트 팔로워 → 곡 인기도 → 원래 곡 순서" },
  { slug: "night-rnb", title: "R&B", source: "R&B · Soul", ranking: "플레이리스트 팔로워 → 곡 인기도 → 원래 곡 순서" },
  { slug: "feel-good", title: "팝·댄스", source: "Pop · Dance", ranking: "플레이리스트 팔로워 → 곡 인기도 → 원래 곡 순서" },
  { slug: "focus", title: "집중", source: "Classical · Focus", ranking: "플레이리스트 팔로워 → 곡 인기도 → 원래 곡 순서" },
];

type PreviewTrack = { id: string; tidalTrackId: string; title: string; artist: string; rank: number; sourcePlaylistId: string; sourcePlaylistName: string };
type PreviewSection = { id: string; slug: string; title: string; discovered: number; currentCount: number; addedCount: number; removedCount: number; tracks: PreviewTrack[] };
type Preview = { sections: PreviewSection[]; canApply: boolean };
type Status = "pending" | "running" | "ready" | "blocked" | "applied" | "failed" | "expired";
type JobRow = { id: string; status: Status; preview: Preview; error_code: string | null; created_at: string; updated_at: string; expires_at: string | null; applied_at: string | null };

export class EditorialRefreshError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) { super(code); this.status = status; this.code = code; }
}

export const EDITORIAL_SNAPSHOT_SQL = `SELECT jsonb_build_object(
  'sections', COALESCE((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.slug)
    FROM ems_editorial_sections s WHERE s.slug = ANY($1::text[])), '[]'::jsonb),
  'memberships', COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.section_id,m.rank,m.track_id)
    FROM ems_track_sections m JOIN ems_editorial_sections s ON s.id=m.section_id
    WHERE s.slug = ANY($1::text[])), '[]'::jsonb)
) AS snapshot`;

function mapJob(row: JobRow) {
  return { id: row.id, status: row.status, preview: row.preview, errorCode: row.error_code,
    createdAt: row.created_at, updatedAt: row.updated_at, expiresAt: row.expires_at, appliedAt: row.applied_at };
}

export async function listEditorialRefreshes(executor: QueryExecutor) {
  const result = await executor.query<JobRow>(`SELECT id,status,preview,error_code,created_at,updated_at,expires_at,applied_at
    FROM ems_editorial_refresh_jobs ORDER BY created_at DESC LIMIT 10`);
  const latest = await executor.query<{ last_refreshed_at: string | null }>(`SELECT max(updated_at) AS last_refreshed_at
    FROM ems_editorial_sections WHERE slug=ANY($1::text[])`, [EDITORIAL_SLUGS]);
  return { criteria: EDITORIAL_CRITERIA, lastRefreshedAt: latest.rows[0]?.last_refreshed_at ?? null,
    limits: { playlistsPerSection: 2, requestBudget: 24, tracksPerSection: 12, previewMinutes: 30 },
    jobs: result.rows.map(mapJob) };
}

export async function createEditorialRefresh(executor: QueryExecutor, actor: string) {
  await executor.query(`UPDATE ems_editorial_refresh_jobs SET status='expired',updated_at=now()
    WHERE status='ready'`);
  await executor.query(`UPDATE ems_editorial_refresh_jobs SET status='failed',error_code='worker_timeout',updated_at=now()
    WHERE status IN ('pending','running') AND updated_at < now()-interval '10 minutes'`);
  try {
    const result = await executor.query<{ id: string }>(`INSERT INTO ems_editorial_refresh_jobs(created_by)
      VALUES ($1) RETURNING id`, [actor]);
    return { id: result.rows[0].id, status: "pending" as const };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      throw new EditorialRefreshError(409, "editorial_refresh_already_open");
    }
    throw error;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validRefreshId(value: string) { return UUID.test(value); }

function validPreview(preview: Preview) {
  if (!preview?.canApply || !Array.isArray(preview.sections) || preview.sections.length !== 5) return false;
  const sectionIds = new Set<string>(); const trackIds = new Set<string>(); const slugs = new Set<string>();
  for (const section of preview.sections) {
    if (!UUID.test(section.id) || sectionIds.has(section.id) || !EDITORIAL_SLUGS.includes(section.slug) || slugs.has(section.slug)
      || !Array.isArray(section.tracks) || section.tracks.length < 6 || section.tracks.length > 12) return false;
    sectionIds.add(section.id); slugs.add(section.slug);
    for (const track of section.tracks) {
      if (!UUID.test(track.id) || trackIds.has(track.id) || !Number.isInteger(track.rank) || track.rank < 0
        || typeof track.sourcePlaylistId !== "string" || !track.sourcePlaylistId
        || typeof track.sourcePlaylistName !== "string" || !track.sourcePlaylistName) return false;
      trackIds.add(track.id);
    }
  }
  return true;
}

export async function applyEditorialRefresh(pool: Pick<Pool, "connect">, id: string, actor: string) {
  if (!validRefreshId(id)) throw new EditorialRefreshError(400, "invalid_editorial_refresh_id");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await client.query<JobRow & { backup: unknown; fresh: boolean }>(`SELECT *,expires_at > now() AS fresh
      FROM ems_editorial_refresh_jobs WHERE id=$1 FOR UPDATE`, [id]);
    const job = result.rows[0];
    if (!job) throw new EditorialRefreshError(404, "editorial_refresh_not_found");
    if (job.status !== "ready" || !job.fresh) throw new EditorialRefreshError(409, "editorial_refresh_not_ready");
    if (!validPreview(job.preview)) throw new EditorialRefreshError(409, "editorial_refresh_invalid_preview");
    await client.query("LOCK TABLE ems_editorial_sections,ems_track_sections IN SHARE ROW EXCLUSIVE MODE");
    // 적용 transaction 동안 상태/availability 갱신을 잠시 막아 최신 재생 조건을 commit까지 유지한다.
    await client.query("LOCK TABLE ems_tracks,ems_availability_events IN SHARE MODE");
    const snapshot = await client.query<{ snapshot: unknown }>(EDITORIAL_SNAPSHOT_SQL, [EDITORIAL_SLUGS]);
    if (!isDeepStrictEqual(snapshot.rows[0]?.snapshot, job.backup)) throw new EditorialRefreshError(409, "editorial_refresh_stale");
    const ids = job.preview.sections.flatMap((section) => section.tracks.map((track) => track.id));
    const playable = await client.query<{ id: string }>(`SELECT e.id FROM ems_tracks e
      JOIN LATERAL (SELECT a.playable FROM ems_availability_events a
        WHERE a.track_id=e.id AND a.region='KR' AND a.capability='STREAM'
        ORDER BY a.observed_at DESC,a.id DESC LIMIT 1) latest ON latest.playable=true
      WHERE e.id=ANY($1::uuid[]) AND e.status='active' AND e.duration_ms>=30000`, [ids]);
    if (playable.rows.length !== ids.length) throw new EditorialRefreshError(409, "editorial_refresh_track_unavailable");
    for (const section of job.preview.sections) {
      const sectionResult = await client.query(`UPDATE ems_editorial_sections SET updated_at=now() WHERE id=$1 AND slug=$2 RETURNING id`, [section.id, section.slug]);
      if (sectionResult.rowCount !== 1) throw new EditorialRefreshError(409, "editorial_refresh_stale");
      await client.query("DELETE FROM ems_track_sections WHERE section_id=$1", [section.id]);
      for (const track of section.tracks) {
        await client.query(`INSERT INTO ems_track_sections(section_id,track_id,rank,source_playlist_id,source_playlist_name)
          VALUES ($1,$2,$3,$4,$5)`, [section.id, track.id, track.rank, track.sourcePlaylistId, track.sourcePlaylistName]);
      }
    }
    const applied = await client.query<JobRow>(`UPDATE ems_editorial_refresh_jobs SET status='applied',applied_by=$2,
      applied_at=now(),updated_at=now() WHERE id=$1 RETURNING *`, [id, actor]);
    await client.query("COMMIT");
    return mapJob(applied.rows[0]);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
}
