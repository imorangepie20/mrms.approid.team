export type QueryExecutor = {
  query<Row extends Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: Row[] }>;
};

export type EmsAdminSummary = {
  activeTrackCount: number;
  activeSectionCount: number;
  artworkMissingCount: number;
  embeddingCounts: Record<string, number>;
  latestIngest: EmsIngestRun | null;
};

export type EmsAdminSection = {
  id: string;
  slug: string;
  title: string;
  description: string;
  sortOrder: number;
  active: boolean;
  trackCount: number;
  updatedAt: string;
};

export type EmsAdminTrack = {
  id: string;
  tidalTrackId: string;
  title: string;
  artist: string;
  album: string;
  durationSeconds: number;
  artworkUrl: string;
  playbackAvailable: boolean;
  embeddingStatus: string;
  sections: Array<{ slug: string; title: string }>;
};

export type EmsIngestRun = {
  id: string;
  runType: string;
  status: string;
  requestedCount: number;
  matchedCount: number;
  errorCode: string | null;
  createdAt: string;
};

type SummaryCountRow = { active_track_count: number; active_section_count: number; artwork_missing_count: number };
type EmbeddingCountRow = { status: string; count: number };
type IngestRow = { id: string; run_type: string; status: string; requested_count: number; matched_count: number; error_code: string | null; created_at: string };
type SectionRow = { id: string; slug: string; title: string; description: string; sort_order: number; active: boolean; track_count: number; updated_at: string };
type TrackRow = { id: string; tidal_id: string; title: string; artist: string; album: string | null; duration_ms: number; artwork_url: string | null; playback_available: boolean; embedding_status: string; sections: Array<{ slug: string; title: string }> | null };

function mapIngestRun(row: IngestRow): EmsIngestRun {
  return {
    id: row.id,
    runType: row.run_type,
    status: row.status,
    requestedCount: Number(row.requested_count),
    matchedCount: Number(row.matched_count),
    errorCode: row.error_code,
    createdAt: row.created_at,
  };
}

export async function getEmsAdminSummary(executor: QueryExecutor): Promise<EmsAdminSummary> {
  const [counts, embeddings, latest] = await Promise.all([
    executor.query<SummaryCountRow>(`/* ems_admin_summary_counts */
      SELECT count(*) FILTER (WHERE e.status = 'active')::int AS active_track_count,
             count(*) FILTER (WHERE e.status = 'active' AND e.artwork_url IS NULL)::int AS artwork_missing_count,
             (SELECT count(*)::int FROM ems_editorial_sections WHERE active = true) AS active_section_count
        FROM ems_tracks AS e`),
    executor.query<EmbeddingCountRow>(`/* ems_admin_embedding_counts */
      SELECT COALESCE(emb.status, 'missing') AS status, count(*)::int AS count
        FROM ems_tracks AS e
        LEFT JOIN ems_track_embeddings AS emb ON emb.track_id = e.id
       WHERE e.status = 'active'
       GROUP BY COALESCE(emb.status, 'missing')`),
    executor.query<IngestRow>(`/* ems_admin_latest_ingest */
      SELECT id, run_type, status, requested_count, matched_count, error_code, created_at
        FROM ems_ingest_runs ORDER BY created_at DESC LIMIT 1`),
  ]);
  const count = counts.rows[0];
  return {
    activeTrackCount: Number(count?.active_track_count ?? 0),
    activeSectionCount: Number(count?.active_section_count ?? 0),
    artworkMissingCount: Number(count?.artwork_missing_count ?? 0),
    embeddingCounts: Object.fromEntries(embeddings.rows.map((row) => [row.status, Number(row.count)])),
    latestIngest: latest.rows[0] ? mapIngestRun(latest.rows[0]) : null,
  };
}

export async function listEmsAdminSections(executor: QueryExecutor): Promise<EmsAdminSection[]> {
  const result = await executor.query<SectionRow>(`/* ems_admin_sections */
    SELECT s.id, s.slug, s.title, s.description, s.sort_order, s.active, s.updated_at,
           count(m.track_id)::int AS track_count
      FROM ems_editorial_sections AS s
      LEFT JOIN ems_track_sections AS m ON m.section_id = s.id
     GROUP BY s.id ORDER BY s.sort_order, s.id`);
  return result.rows.map((row) => ({ id: row.id, slug: row.slug, title: row.title, description: row.description, sortOrder: row.sort_order, active: row.active, trackCount: Number(row.track_count), updatedAt: row.updated_at }));
}

export type EmsAdminTrackOptions = { query?: string; page?: number; limit?: number; status?: string; embeddingStatus?: string; region?: string };

export async function listEmsAdminTracks(options: EmsAdminTrackOptions, executor: QueryExecutor) {
  const query = options.query?.trim() ?? "";
  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const limit = Math.min(100, Math.max(1, Math.trunc(options.limit ?? 24)));
  const region = (options.region ?? "KR").toUpperCase();
  const offset = (page - 1) * limit;
  const values: unknown[] = [region, limit, offset];
  const countValues: unknown[] = [];
  const clauses = ["e.status = 'active'"];
  const countClauses = ["e.status = 'active'"];
  if (options.status) {
    const allowedStatuses = new Set(["active", "candidate", "stale", "inactive", "rejected"]);
    if (!allowedStatuses.has(options.status)) throw new Error("invalid_track_status");
    values.push(options.status);
    countValues.push(options.status);
    clauses[0] = `e.status = $${values.length}`;
    countClauses[0] = `e.status = $${countValues.length}`;
  }
  if (query) {
    values.push(`%${query}%`);
    clauses.push(`(e.title ILIKE $${values.length} OR e.artist ILIKE $${values.length} OR COALESCE(e.album, '') ILIKE $${values.length})`);
    countValues.push(`%${query}%`);
    countClauses.push(`(e.title ILIKE $${countValues.length} OR e.artist ILIKE $${countValues.length} OR COALESCE(e.album, '') ILIKE $${countValues.length})`);
  }
  if (options.embeddingStatus) {
    values.push(options.embeddingStatus);
    clauses.push(`COALESCE(emb.status, 'missing') = $${values.length}`);
    countValues.push(options.embeddingStatus);
    countClauses.push(`COALESCE(emb.status, 'missing') = $${countValues.length}`);
  }
  const filter = clauses.join(" AND ");
  const countFilter = countClauses.join(" AND ");
  const [count, rows] = await Promise.all([
    executor.query<{ total_count: number }>(`/* ems_admin_track_count */ SELECT count(*)::int AS total_count FROM ems_tracks AS e LEFT JOIN ems_track_embeddings AS emb ON emb.track_id = e.id WHERE ${countFilter}`, countValues),
    executor.query<TrackRow>(`/* ems_admin_tracks */
      SELECT e.id, e.tidal_id, e.title, e.artist, e.album, e.duration_ms, e.artwork_url,
             COALESCE(availability.playable, false) AS playback_available,
             COALESCE(emb.status, 'missing') AS embedding_status,
             COALESCE(json_agg(json_build_object('slug', s.slug, 'title', s.title) ORDER BY s.sort_order) FILTER (WHERE s.id IS NOT NULL), '[]') AS sections
        FROM ems_tracks AS e
        LEFT JOIN ems_track_embeddings AS emb ON emb.track_id = e.id
        LEFT JOIN ems_track_sections AS m ON m.track_id = e.id
        LEFT JOIN ems_editorial_sections AS s ON s.id = m.section_id
        LEFT JOIN LATERAL (
          SELECT a.playable FROM ems_availability_events AS a
           WHERE a.track_id = e.id AND a.region = $1 AND a.capability = 'STREAM'
           ORDER BY a.observed_at DESC, a.id DESC LIMIT 1
        ) AS availability ON true
       WHERE ${filter}
       GROUP BY e.id, availability.playable, emb.status
       ORDER BY e.updated_at DESC, e.id DESC LIMIT $2 OFFSET $3`, values),
  ]);
  const totalCount = Number(count.rows[0]?.total_count ?? 0);
  return {
    totalCount,
    page,
    limit,
    nextPage: offset + rows.rows.length < totalCount ? page + 1 : null,
    tracks: rows.rows.map((row) => ({ id: row.id, tidalTrackId: row.tidal_id, title: row.title, artist: row.artist, album: row.album ?? "Unknown Album", durationSeconds: Math.round(row.duration_ms / 1000), artworkUrl: row.artwork_url ?? "", playbackAvailable: Boolean(row.playback_available), embeddingStatus: row.embedding_status, sections: row.sections ?? [] })),
  };
}

export async function listEmsIngestRuns(options: { page?: number; limit?: number }, executor: QueryExecutor) {
  const page = Math.max(1, Math.trunc(options.page ?? 1));
  const limit = Math.min(100, Math.max(1, Math.trunc(options.limit ?? 20)));
  const offset = (page - 1) * limit;
  const result = await executor.query<IngestRow>(`/* ems_admin_ingest_runs */
    SELECT id, run_type, status, requested_count, matched_count, error_code, created_at
      FROM ems_ingest_runs ORDER BY created_at DESC LIMIT $1 OFFSET $2`, [limit, offset]);
  return result.rows.map(mapIngestRun);
}

export type EmsSectionPatch = { title: string; description: string; sortOrder: number; active: boolean };

export async function updateEmsSection(id: string, patch: EmsSectionPatch, executor: QueryExecutor) {
  if (!id.trim()) throw new Error("invalid_section_id");
  if (!patch.title.trim() || patch.title.length > 160) throw new Error("invalid_section_title");
  if (patch.description.length > 500) throw new Error("invalid_section_description");
  if (!Number.isInteger(patch.sortOrder) || patch.sortOrder < 0) throw new Error("invalid_section_sort_order");
  if (typeof patch.active !== "boolean") throw new Error("invalid_section_active");
  const result = await executor.query<SectionRow>(`/* ems_admin_update_section */
    WITH updated AS (
      UPDATE ems_editorial_sections
         SET title = $1, description = $2, sort_order = $3, active = $4, updated_at = now()
       WHERE id = $5
       RETURNING id, slug, title, description, sort_order, active, updated_at
    )
    SELECT updated.id, updated.slug, updated.title, updated.description, updated.sort_order,
           updated.active, updated.updated_at, count(m.track_id)::int AS track_count
      FROM updated
      LEFT JOIN ems_track_sections AS m ON m.section_id = updated.id
     GROUP BY updated.id, updated.slug, updated.title, updated.description,
              updated.sort_order, updated.active, updated.updated_at`, [patch.title.trim(), patch.description.trim(), patch.sortOrder, patch.active, id]);
  const row = result.rows[0];
  if (!row) throw new Error("ems_section_not_found");
  return { id: row.id, slug: row.slug, title: row.title, description: row.description, sortOrder: row.sort_order, active: row.active, trackCount: Number(row.track_count), updatedAt: row.updated_at } satisfies EmsAdminSection;
}
